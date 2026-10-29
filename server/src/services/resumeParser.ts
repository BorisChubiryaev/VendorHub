import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { CITIES, extractCity, extractLevel, extractRole, extractSkills, normalizeLevel, normalizeRole, normalizeSkill } from '../lib/dictionaries.js';
import { llmJson } from './llm.js';

export interface ParsedResume {
  full_name: string | null;
  age: number | null;
  city: string | null;
  role: string | null;
  level: string | null;
  skills: string[];
  total_experience: number | null;
  rate: number | null;
  sber_experience: string | null;
  resume_experience: string | null;
  /** Какие поля распознать не удалось — подсвечиваются менеджеру бассейна. */
  missing: string[];
}

export async function pdfToText(buffer: Buffer): Promise<string> {
  let r;
  try {
    r = await pdfParse(buffer);
  } catch {
    throw new Error('Не удалось прочитать PDF: файл повреждён или не является PDF');
  }
  return r.text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

const NAME_RE = /^([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?$/;
const STOP_WORDS = /резюме|опыт|навык|образован|контакт|желаем|должност|город|телефон|почта|о себе|ключев/i;

function findName(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/^(?:ФИО|Ф\.И\.О\.|Кандидат)\s*[:\-–—]\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  for (const line of lines.slice(0, 12)) {
    const l = line.trim();
    if (STOP_WORDS.test(l) || CITIES.some((c) => l.includes(c))) continue;
    if (NAME_RE.test(l)) return l;
  }
  return null;
}

function yearsBetween(birth: Date, now = new Date()) {
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

function findAge(text: string): number | null {
  const direct = text.match(/(?:Возраст\s*[:\-–—]?\s*|,\s*)(\d{2})\s*(?:год|года|лет)\b/i) ?? text.match(/\b(\d{2})\s*(?:год|года|лет)\b,?\s*родил/i);
  if (direct) return Number(direct[1]);
  const dob = text.match(/(?:Дата рождения|родил(?:ся|ась))\s*[:\-–—]?\s*(\d{1,2})[.\s]+(\d{1,2}|[а-яё]+)[.\s]+(\d{4})/i);
  if (dob) {
    const monthRaw = dob[2].toLowerCase();
    const month = /^\d+$/.test(monthRaw) ? Number(monthRaw) - 1 : MONTHS.findIndex((m) => monthRaw.startsWith(m));
    if (month >= 0) return yearsBetween(new Date(Number(dob[3]), month, Number(dob[1])));
  }
  return null;
}

function findExperience(text: string): number | null {
  const m = text.match(/(?:Опыт работы|Общий опыт|Суммарный опыт|Стаж)[^\d\n]{0,20}(\d{1,2})\s*(?:год|года|лет)(?:\s*(\d{1,2})\s*месяц)?/i);
  if (m) return Math.round((Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)) * 10) / 10;
  const alt = text.match(/(\d{1,2})\+?\s*(?:год|года|лет)\s+(?:опыта|коммерческ)/i);
  return alt ? Number(alt[1]) : null;
}

function findRate(text: string): number | null {
  const m = text.match(/(\d[\d\s]{2,6})\s*(?:руб(?:\.|лей)?|₽|р\.)\s*(?:\/|в|за)\s*час/i)
    ?? text.match(/Ставка\s*[:\-–—]?\s*(\d[\d\s]{2,6})/i);
  return m ? Number(m[1].replace(/\s/g, '')) : null;
}

function findLabeled(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^(?:${label.source})\\s*[:\\-–—]?\\s*(.*)$`, 'i'));
    if (m) return (m[1] || lines[i + 1] || '').trim() || null;
  }
  return null;
}

function section(text: string, start: RegExp, end: RegExp): string | null {
  const m = start.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const firstNl = rest.indexOf('\n');
  const body = firstNl >= 0 ? rest.slice(firstNl + 1) : '';
  const e = body.search(end);
  return (e >= 0 ? body.slice(0, e) : body).trim().slice(0, 4000) || null;
}

export function parseResumeText(text: string): ParsedResume {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 25).join('\n');

  const desired = findLabeled(lines, /Желаемая должность|Должность|Позиция|Роль/);
  const role = normalizeRole(desired && extractRole(desired) ? extractRole(desired) : extractRole(head) ?? extractRole(text));
  const level = normalizeLevel((desired && extractLevel(desired)) ?? extractLevel(head) ?? extractLevel(text));
  const cityLabeled = findLabeled(lines, /Город|Проживает|Место жительства|Локация/);
  const city = (cityLabeled && extractCity(cityLabeled)) ?? cityLabeled ?? extractCity(head);

  const experienceSection = section(text, /(^|\n)\s*Опыт работы/i, /\n\s*(Образование|Ключевые навыки|Навыки|О себе|Сертификаты|Курсы)\b/i);
  const sberLines = (experienceSection ?? text).split('\n').filter((l) => /сбер/i.test(l));

  const result: ParsedResume = {
    full_name: findName(lines),
    age: findAge(text),
    city,
    role,
    level,
    skills: extractSkills(text).map(normalizeSkill),
    total_experience: findExperience(text),
    rate: findRate(text),
    sber_experience: sberLines.length ? sberLines.join('\n').slice(0, 1000) : null,
    resume_experience: experienceSection,
    missing: [],
  };
  result.missing = (['full_name', 'age', 'city', 'role', 'level', 'total_experience', 'rate'] as const).filter((k) => result[k] == null);
  if (!result.skills.length) result.missing.push('skills');
  return result;
}

/** Распознавание резюме: rule-based разбор, дополненный LLM (если подключена). */
export async function parseResume(text: string): Promise<ParsedResume> {
  const base = parseResumeText(text);
  if (!base.missing.length) return base;
  const ai = await llmJson<Partial<ParsedResume>>(
    'Ты извлекаешь данные из резюме IT-специалиста. Верни строго JSON с полями: full_name, age (число), city, role, level (Junior/Middle/Senior/Lead), skills (массив строк), total_experience (лет, число), rate (руб/час, число). Неизвестное — null.',
    text.slice(0, 12_000),
  );
  if (!ai) return base;
  const merged: ParsedResume = { ...base };
  for (const k of base.missing) {
    const v = (ai as any)[k];
    if (v != null && !(Array.isArray(v) && !v.length)) (merged as any)[k] = v;
  }
  if (merged.role) merged.role = normalizeRole(merged.role);
  if (merged.level) merged.level = normalizeLevel(merged.level);
  merged.skills = [...new Set(merged.skills.map(normalizeSkill))];
  merged.missing = base.missing.filter((k) => (merged as any)[k] == null || (Array.isArray((merged as any)[k]) && !(merged as any)[k].length));
  return merged;
}
