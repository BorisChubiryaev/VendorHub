/** Справочники предметной области. В целевом решении часть из них приходит из ЕКОУ / мастер-систем. */

export const ROLES: { name: string; synonyms: string[] }[] = [
  { name: 'Backend-разработчик', synonyms: ['backend', 'бэкенд', 'бекенд', 'back-end', 'java-разработчик', 'java разработчик', 'python-разработчик', 'python разработчик', 'go-разработчик', 'серверный разработчик', 'бэк', 'бэкендер', 'бэкендщик'] },
  { name: 'Frontend-разработчик', synonyms: ['frontend', 'фронтенд', 'фронт', 'front-end', 'react-разработчик', 'фронтендер', 'фронтендщик', 'верстальщик'] },
  { name: 'Fullstack-разработчик', synonyms: ['fullstack', 'фулстек', 'full-stack', 'фуллстек'] },
  { name: 'Mobile-разработчик', synonyms: ['mobile', 'мобильный разработчик', 'ios-разработчик', 'android-разработчик', 'ios', 'android', 'мобильщик'] },
  { name: 'QA-инженер', synonyms: ['qa', 'тестировщик', 'тестирование', 'автотестировщик', 'инженер по тестированию', 'aqa', 'qa engineer'] },
  { name: 'DevOps-инженер', synonyms: ['devops', 'девопс', 'sre', 'инженер devops'] },
  { name: 'Системный аналитик', synonyms: ['системный аналитик', 'system analyst', 'sa', 'аналитик'] },
  { name: 'Бизнес-аналитик', synonyms: ['бизнес-аналитик', 'бизнес аналитик', 'business analyst', 'ba'] },
  { name: 'Data Scientist', synonyms: ['data scientist', 'дата сайентист', 'ml-инженер', 'ml engineer', 'ml', 'машинное обучение'] },
  { name: 'Data Engineer', synonyms: ['data engineer', 'дата инженер', 'инженер данных', 'etl-разработчик'] },
  { name: 'Архитектор', synonyms: ['архитектор', 'architect', 'solution architect', 'системный архитектор'] },
  { name: 'UX/UI-дизайнер', synonyms: ['дизайнер', 'designer', 'ux', 'ui', 'ux/ui', 'продуктовый дизайнер'] },
  { name: 'Руководитель проекта', synonyms: ['руководитель проекта', 'project manager', 'pm', 'менеджер проекта', 'рп'] },
  { name: 'Scrum-мастер', synonyms: ['scrum', 'скрам', 'agile coach', 'скрам-мастер'] },
];

export const LEVELS = ['Junior', 'Middle', 'Senior', 'Lead'] as const;
export const LEVEL_SYNONYMS: Record<string, (typeof LEVELS)[number]> = {
  junior: 'Junior', джуниор: 'Junior', джун: 'Junior', младший: 'Junior',
  middle: 'Middle', мидл: 'Middle', миддл: 'Middle', средний: 'Middle',
  senior: 'Senior', сеньор: 'Senior', синьор: 'Senior', старший: 'Senior', ведущий: 'Senior',
  lead: 'Lead', лид: 'Lead', тимлид: 'Lead', 'team lead': 'Lead', техлид: 'Lead', главный: 'Lead',
};

export const SKILLS = [
  'Java', 'Kotlin', 'Spring', 'Python', 'Django', 'FastAPI', 'Go', 'C#', '.NET', 'C++', 'Scala',
  'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Next.js', 'HTML', 'CSS',
  'Swift', 'iOS', 'Android', 'Flutter',
  'PostgreSQL', 'Oracle', 'MySQL', 'MongoDB', 'Redis', 'ClickHouse', 'Greenplum', 'SQL',
  'Kafka', 'RabbitMQ', 'Docker', 'Kubernetes', 'OpenShift', 'Ansible', 'Terraform', 'Jenkins', 'GitLab CI', 'Linux',
  'Hadoop', 'Spark', 'Airflow', 'PyTorch', 'TensorFlow', 'Pandas', 'ML', 'NLP', 'LLM',
  'Selenium', 'Playwright', 'JUnit', 'pytest', 'Postman', 'Нагрузочное тестирование',
  'REST', 'gRPC', 'GraphQL', 'Микросервисы', 'BPMN', 'UML', 'Camunda', 'Figma',
  'Jira', 'Confluence', 'Scrum', 'Kanban',
];

export const SKILL_SYNONYMS: Record<string, string> = {
  джава: 'Java', спринг: 'Spring', питон: 'Python', пайтон: 'Python', голанг: 'Go', golang: 'Go',
  реакт: 'React', 'react.js': 'React', reactjs: 'React', vuejs: 'Vue', 'vue.js': 'Vue', node: 'Node.js', nodejs: 'Node.js', js: 'JavaScript', ts: 'TypeScript',
  постгрес: 'PostgreSQL', postgres: 'PostgreSQL', оракл: 'Oracle', кафка: 'Kafka', докер: 'Docker',
  кубернетес: 'Kubernetes', k8s: 'Kubernetes', кубер: 'Kubernetes', микросервисы: 'Микросервисы', microservices: 'Микросервисы',
  нагрузочное: 'Нагрузочное тестирование', 'c sharp': 'C#', дотнет: '.NET', фигма: 'Figma', 'rest api': 'REST',
};

export const CITIES = [
  'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Самара',
  'Ростов-на-Дону', 'Краснодар', 'Воронеж', 'Пермь', 'Уфа', 'Челябинск', 'Омск', 'Томск', 'Иннополис',
  'Владивосток', 'Калининград', 'Ярославль', 'Саратов', 'Тула', 'Минск', 'Удалённо',
];

export const CANDIDATE_STATUSES = { draft: 'Черновик', active: 'Активна', archived: 'Архив' } as const;
export const UVB_STATUSES = {
  not_checked: 'Не проверен',
  in_progress: 'На проверке',
  passed: 'Проверка пройдена',
  failed: 'Проверка не пройдена',
} as const;

export const NEED_STATUSES = {
  draft: 'Черновик',
  matching: 'Подбор вариантов',
  in_hq: 'Передана в штаб',
  completed: 'Обеспечена',
  cancelled: 'Отменена',
} as const;

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/** Привести название роли к справочному значению (или вернуть как есть). */
export function normalizeRole(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = norm(input);
  for (const r of ROLES) if (norm(r.name) === s) return r.name;
  for (const r of ROLES) if (r.synonyms.some((syn) => norm(syn) === s)) return r.name;
  for (const r of ROLES) if (s.includes(norm(r.name)) || r.synonyms.some((syn) => syn.length > 3 && s.includes(norm(syn)))) return r.name;
  return input.trim();
}

export function normalizeLevel(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = norm(input);
  for (const l of LEVELS) if (norm(l) === s) return l;
  return LEVEL_SYNONYMS[s] ?? input.trim();
}

export function normalizeSkill(input: string): string {
  const s = norm(input);
  const exact = SKILLS.find((k) => norm(k) === s);
  if (exact) return exact;
  return SKILL_SYNONYMS[s] ?? input.trim();
}

export function sameSkill(a: string, b: string) {
  return norm(normalizeSkill(a)) === norm(normalizeSkill(b));
}

export function sameRole(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return norm(normalizeRole(a) ?? '') === norm(normalizeRole(b) ?? '');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Слово/фраза целиком: границы — не буква/цифра (учитывая кириллицу и символы вроде # и +). */
export function containsTerm(text: string, term: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}+#])${escapeRe(norm(term))}(?=$|[^\\p{L}\\p{N}+#])`, 'u');
  return re.test(norm(text));
}

/** Найти в произвольном тексте упоминания навыков. */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const skill of SKILLS) if (containsTerm(text, skill)) found.add(skill);
  for (const [syn, skill] of Object.entries(SKILL_SYNONYMS)) if (containsTerm(text, syn)) found.add(skill);
  // "ML" ловится внутри "ML-инженер" — допустимо; "SQL" дублирует конкретные СУБД — оставляем.
  return [...found];
}

export interface RoleMention {
  role: string;
  start: number;
  end: number;
}

/**
 * Все упоминания ролей в тексте с позициями. Учитывает падежные окончания («разработчика», «тестировщиков»).
 * Короткие латинские синонимы (qa, ux) — только целым словом; двухбуквенные аббревиатуры вроде sa/pm игнорируются.
 */
export function findRoleMentions(text: string): RoleMention[] {
  const t = norm(text);
  const found: RoleMention[] = [];
  for (const r of ROLES) {
    for (const term of [r.name, ...r.synonyms]) {
      const tn = norm(term);
      if (tn.length <= 2 && !['qa', 'ux'].includes(tn)) continue;
      const cyrEnding = /[а-я]$/.test(tn) ? '[а-я]{0,4}' : '';
      const re = new RegExp(`(^|[^\\p{L}\\p{N}+#])(${escapeRe(tn)}${cyrEnding})(?=$|[^\\p{L}\\p{N}+#])`, 'gu');
      for (const m of t.matchAll(re)) {
        const start = m.index! + m[1].length;
        found.push({ role: r.name, start, end: start + m[2].length });
      }
    }
  }
  // Убираем вложенные/пересекающиеся совпадения, оставляя самые длинные
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: RoleMention[] = [];
  for (const m of found) {
    const last = result[result.length - 1];
    if (last && m.start < last.end) continue;
    result.push(m);
  }
  return result;
}

/** Найти в тексте роль; возвращает первую по позиции в тексте. */
export function extractRole(text: string): string | null {
  return findRoleMentions(text)[0]?.role ?? null;
}

export function extractLevel(text: string): string | null {
  for (const [syn, level] of Object.entries(LEVEL_SYNONYMS)) if (containsTerm(text, syn)) return level;
  return null;
}

export function extractCity(text: string): string | null {
  for (const c of CITIES) if (containsTerm(text, c)) return c;
  if (containsTerm(text, 'мск')) return 'Москва';
  if (containsTerm(text, 'спб') || containsTerm(text, 'питер')) return 'Санкт-Петербург';
  return null;
}
