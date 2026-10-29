import { extractLevel, extractSkills, findRoleMentions, normalizeSkill } from '../../lib/dictionaries.js';

/** Rule-based разбор свободного текста о потребности. */

export interface DraftPosition {
  role: string;
  level: string | null;
  quantity: number;
  skills: string[];
  start_date: string | null;
  end_date: string | null;
}

export interface Extracted {
  product: string | null;
  requirements: string | null;
  backlogRef: string | null;
  positions: DraftPosition[];
  dates: { start: string | null; end: string | null };
}

const MONTHS: [RegExp, number][] = [
  [/^январ/, 1], [/^феврал/, 2], [/^март/, 3], [/^апрел/, 4], [/^ма[йя]/, 5], [/^июн/, 6],
  [/^июл/, 7], [/^август/, 8], [/^сентябр/, 9], [/^октябр/, 10], [/^ноябр/, 11], [/^декабр/, 12],
];
const MONTH_WORD = '(январ[ьяе]|феврал[ьяе]|март[ае]?|апрел[ьяе]|ма[йяе]|июн[ьяе]|июл[ьяе]|август[ае]?|сентябр[ьяе]|октябр[ьяе]|ноябр[ьяе]|декабр[ьяе])';

const NUMBER_WORDS: Record<string, number> = {
  один: 1, одного: 1, одна: 1, одну: 1, одной: 1,
  два: 2, двух: 2, две: 2, пара: 2, пару: 2, парочку: 2,
  три: 3, трех: 3, трёх: 3, четыре: 4, четырех: 4, четырёх: 4, пять: 5, пяти: 5,
  шесть: 6, шести: 6, семь: 7, семи: 7, восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10,
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthNum = (word: string) => MONTHS.find(([re]) => re.test(word.toLowerCase()))?.[1] ?? null;

function addMonths(isoDate: string, months: number) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface DateToken { index: number; date: string; kind: 'from' | 'to' | 'unknown'; monthOnly: boolean; explicitYear: boolean }

/** Извлечь даты: «с 1 декабря по 31 мая», «с 01.12.2026 до 30.06.2027», «с января на 6 месяцев», «на полгода». */
export function parseDates(text: string, today = new Date().toISOString().slice(0, 10)): { start: string | null; end: string | null } {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  const tokens: DateToken[] = [];
  const kindAt = (index: number): DateToken['kind'] => {
    const before = t.slice(Math.max(0, index - 14), index);
    if (/(^|\s)(с|со|от|начиная с|старт|начало|начать|выход)\s*(начала\s*)?$/.test(before)) return 'from';
    if (/(^|\s)(по|до|until|конец|окончание|завершение)\s*(конца\s*)?$/.test(before)) return 'to';
    return 'unknown';
  };
  const ty = Number(today.slice(0, 4));

  for (const m of t.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g)) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    tokens.push({ index: m.index!, date: iso(y, Number(m[2]), Number(m[1])), kind: kindAt(m.index!), monthOnly: false, explicitYear: true });
  }
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    tokens.push({ index: m.index!, date: m[0], kind: kindAt(m.index!), monthOnly: false, explicitYear: true });
  }
  for (const m of t.matchAll(new RegExp(`(?:(\\d{1,2})\\s+)?${MONTH_WORD}(?:\\s+(\\d{4}))?`, 'g'))) {
    const month = monthNum(m[2]);
    if (!month) continue;
    // «май»/«мая» как слово легко спутать; требуем день, год или предлог рядом
    const kind = kindAt(m.index!);
    if (!m[1] && !m[3] && kind === 'unknown') continue;
    const y = m[3] ? Number(m[3]) : ty;
    const day = m[1] ? Number(m[1]) : kind === 'to' ? lastDay(y, month) : 1;
    tokens.push({ index: m.index!, date: iso(y, month, Math.min(day, lastDay(y, month))), kind, monthOnly: !m[1], explicitYear: !!m[3] });
  }
  tokens.sort((a, b) => a.index - b.index);

  let start = tokens.find((x) => x.kind === 'from') ?? tokens.find((x) => x.kind === 'unknown') ?? null;
  let end = tokens.find((x) => x.kind === 'to' && x !== start) ?? tokens.find((x) => x !== start && x.index > (start?.index ?? -1)) ?? null;
  if (!start && end && tokens.length > 1) start = tokens.find((x) => x !== end) ?? null;

  // Без явного года дата относится к ближайшему будущему
  let s = start?.date ?? null;
  if (start && !start.explicitYear && s! < today) s = String(Number(s!.slice(0, 4)) + 1) + s!.slice(4);
  let e = end?.date ?? null;
  if (end && e) {
    if (end.monthOnly && end.kind !== 'to') {
      const [y, mm] = e.split('-').map(Number);
      e = iso(y, mm, lastDay(y, mm));
    }
    if (!end.explicitYear) {
      while (e < (s ?? today)) e = String(Number(e.slice(0, 4)) + 1) + e.slice(4);
    }
  }

  // Длительность: «на 6 месяцев», «на полгода», «на год», «на 3 мес»
  const dur = t.match(/на\s+(\d{1,2}|полгода|год|два года|квартал)\s*(месяц[а-я]*|мес\.?|года|лет)?/);
  if (dur && !e) {
    const months = dur[1] === 'полгода' ? 6 : dur[1] === 'год' ? 12 : dur[1] === 'два года' ? 24 : dur[1] === 'квартал' ? 3
      : /год|лет/.test(dur[2] ?? '') ? Number(dur[1]) * 12 : Number(dur[1]);
    if (months > 0 && months <= 60) {
      if (!s && /(сразу|как можно скорее|асап|asap|срочно|немедленно)/.test(t)) s = today;
      if (s) e = addMonths(s, months);
    }
  }
  if (!s && /(сразу|как можно скорее|асап|asap|срочно|немедленно)/.test(t)) s = today;
  return { start: s, end: e };
}

function quantityBefore(text: string, roleStart: number): number {
  const before = text.slice(Math.max(0, roleStart - 40), roleStart).toLowerCase();
  const words = before.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(-4).reverse();
  for (const w of words) {
    if (/^\d{1,2}$/.test(w)) return Number(w);
    if (NUMBER_WORDS[w] != null) return NUMBER_WORDS[w];
  }
  // «разработчики x3», «разработчик — 2 шт.»
  return 1;
}

/** Позиции ролевого состава из текста: каждая роль получает текст до следующего упоминания роли. */
export function parsePositions(text: string, today?: string): DraftPosition[] {
  const mentions = findRoleMentions(text);
  // Разделители между позициями: знаки препинания или союз «и»
  const SEP = /[,;.\n]|\s(?:и|а также|плюс|\+)\s/giu;
  const lastSep = (s: string) => {
    let idx = -1;
    let len = 0;
    for (const m of s.matchAll(SEP)) { idx = m.index!; len = m[0].length; }
    return { idx, len };
  };
  return mentions.map((m, i) => {
    // окно позиции: текст после последнего разделителя перед ролью + роль + текст до последнего разделителя перед следующей ролью
    const prevEnd = i > 0 ? mentions[i - 1].end : 0;
    const nextStart = i + 1 < mentions.length ? mentions[i + 1].start : text.length;
    const preRaw = text.slice(prevEnd, m.start);
    const preSep = lastSep(preRaw);
    const pre = preSep.idx >= 0 ? preRaw.slice(preSep.idx + preSep.len) : preRaw;
    const postRaw = text.slice(m.end, nextStart);
    const postSep = i + 1 < mentions.length ? lastSep(postRaw) : { idx: -1, len: 0 };
    const post = postSep.idx >= 0 ? postRaw.slice(0, postSep.idx) : postRaw;
    const window = pre + text.slice(m.start, m.end) + post;
    const qtyAfter = post.match(/(?:^|\s)(?:[x×х]\s*(\d{1,2})(?=\s|$|[,;.])|[-–—:]?\s*(\d{1,2})\s*(?:шт|чел|человек))/iu);
    const dates = parseDates(post, today);
    return {
      role: m.role,
      level: extractLevel(window),
      quantity: qtyAfter ? Number(qtyAfter[1] ?? qtyAfter[2]) : quantityBefore(pre, pre.length),
      skills: extractSkills(window).map(normalizeSkill),
      start_date: dates.start,
      end_date: dates.end,
    };
  });
}

function extractProduct(text: string, knownProducts: string[]): string | null {
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const known = knownProducts
    .filter((p) => lower.includes(p.toLowerCase().replace(/ё/g, 'е')))
    .sort((a, b) => b.length - a.length)[0];
  if (known) return known;
  const quoted = text.match(/продукт[а-яё]*\s*[:\-–—]?\s*[«"“]([^»"”]{2,80})[»"”]/i);
  if (quoted) return quoted[1].trim();
  const plain = text.match(/продукт[а-яё]*\s*[:\-–—]\s*([^\n,.;]{2,80})/i);
  if (plain) return plain[1].trim();
  const forProduct = text.match(/(?:для|в)\s+продукт[а-яё]*\s+([А-ЯЁA-Z][^\n,.;]{1,60}?)(?=\s+(?:нужн|требу|ищем|необходим|на\s)|[,.;\n]|$)/);
  return forProduct ? forProduct[1].trim() : null;
}

function extractBacklogRef(text: string): string | null {
  const url = text.match(/https?:\/\/\S+\/browse\/[A-Za-z][A-Za-z0-9_]*-\d+/);
  if (url) return url[0];
  const key = text.match(/\b([A-Z][A-Z0-9_]{1,15}-\d{1,7})\b/);
  return key ? key[1] : null;
}

function extractRequirements(text: string): string | null {
  const labeled = text.match(/(?:требования|задача|задачи|цель|функционал|нужно\s+(?:сделать|реализовать|разработать|доработать)|необходимо\s+(?:сделать|реализовать|разработать|доработать)|планируем\s+(?:сделать|реализовать|разработать)|хотим\s+(?:сделать|реализовать|разработать))\s*[:\-–—]?\s*([^\n]{10,600})/i);
  if (!labeled) return null;
  // обрезаем часть про людей, если она в той же фразе
  const cut = labeled[1].split(/[.;]\s*(?=(?:нужн|требу|ищем|необходим|в команду|состав))/i)[0];
  return cut.trim().replace(/[.;,\s]+$/, '');
}

export function extract(text: string, knownProducts: string[], today?: string): Extracted {
  return {
    product: extractProduct(text, knownProducts),
    requirements: extractRequirements(text),
    backlogRef: extractBacklogRef(text),
    positions: parsePositions(text, today),
    dates: parseDates(text, today),
  };
}

export const isYes = (t: string) => /^(да|ага|ок|окей|ok|верно|все верно|всё верно|подтверждаю|регистрируй|зарегистрируй|сохрани|сохранить|давай|го|yes)(?=$|[^\p{L}])/iu.test(t.trim());
export const isSubmit = (t: string) => /(отправ|на подбор|подбери|подобрать|запусти)/i.test(t);
export const isNo = (t: string) => /^(нет|не так|неверно|изменить|исправить|поправ[а-я]*)(?=$|[^\p{L}])/iu.test(t.trim());
export const isReset = (t: string) => /^(заново|сброс|начать заново|новая потребность|\/start|\/new)(?=$|[^\p{L}])/iu.test(t.trim());
export const isCancel = (t: string) => /^(отмена|отменить|стоп|\/cancel)(?=$|[^\p{L}])/iu.test(t.trim());
