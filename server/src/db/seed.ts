import bcrypt from 'bcryptjs';
import { all, get, json, run, tx } from './index.js';

/** Детерминированный ГПСЧ, чтобы демо-данные были одинаковыми между запусками. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const DEMO_USERS = [
  { login: 'customer', password: 'customer', full_name: 'Иванов Иван Петрович', roles: ['customer'], tribe: 'Розничный бизнес' },
  { login: 'customer2', password: 'customer2', full_name: 'Смирнова Ольга Андреевна', roles: ['customer'], tribe: 'Корпоративный бизнес' },
  { login: 'manager', password: 'manager', full_name: 'Кузнецова Мария Сергеевна', roles: ['pool_manager'], tribe: 'Блок Т' },
  { login: 'admin', password: 'admin', full_name: 'Администратор ВендорХаба', roles: ['customer', 'pool_manager'], tribe: 'Розничный бизнес' },
];

export function seedIfEmpty() {
  const exists = get<{ n: number }>('SELECT COUNT(*) AS n FROM users');
  if (exists && exists.n > 0) return false;
  seed();
  return true;
}

export function seed() {
  tx(() => {
    const tribes: Record<string, number> = {};
    for (const [name, unit] of [
      ['Розничный бизнес', 'Блок Розничный бизнес'],
      ['Корпоративный бизнес', 'Блок Корпоративно-инвестиционный бизнес'],
      ['Платформа данных', 'Блок Технологии'],
      ['Блок Т', 'Блок Технологии'],
    ]) tribes[name] = run('INSERT INTO tribes (name, unit) VALUES (?, ?)', name, unit).id;

    const users: Record<string, number> = {};
    for (const u of DEMO_USERS) {
      users[u.login] = run(
        'INSERT INTO users (login, password_hash, full_name, email, roles, tribe_id) VALUES (?, ?, ?, ?, ?, ?)',
        u.login, bcrypt.hashSync(u.password, 8), u.full_name, `${u.login}@vendorhub.local`, json.str(u.roles), tribes[u.tribe],
      ).id;
    }

    for (const [name, tribe] of [
      ['Мобильный банк', 'Розничный бизнес'], ['Кредитный конвейер', 'Розничный бизнес'], ['Вклады и счета', 'Розничный бизнес'],
      ['Платёжные сервисы', 'Розничный бизнес'], ['Зарплатный проект', 'Корпоративный бизнес'], ['Расчётно-кассовое обслуживание', 'Корпоративный бизнес'],
      ['Корпоративные кредиты', 'Корпоративный бизнес'], ['Фабрика данных', 'Платформа данных'], ['Витрины данных', 'Платформа данных'],
    ]) run('INSERT INTO products (name, tribe_id) VALUES (?, ?)', name, tribes[tribe]);

    const vendors: Record<string, number> = {};
    for (const [name, inn] of [
      ['ООО «Альфа Софт»', '7701000001'], ['ООО «Бета Системс»', '7701000002'], ['АО «Гамма Консалтинг»', '7701000003'],
      ['ООО «Дельта Технологии»', '7701000004'], ['ООО «Эпсилон Диджитал»', '7701000005'], ['ООО «Зета Лаб»', '7701000006'],
    ]) vendors[name] = run('INSERT INTO vendors (name, inn, contact) VALUES (?, ?, ?)', name, inn, `sales@${inn}.example`).id;

    const contract = (number: string, vendor: string, roles: [string, number][], start: string, end: string) =>
      run('INSERT INTO contracts (number, vendor_id, roles, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
        number, vendors[vendor], json.str(roles.map(([role, rate]) => ({ role, rate }))), start, end).id;
    const limit = (contractId: number, owner: string | null, amount: number, start: string, end: string) =>
      run('INSERT INTO limits (contract_id, owner_type, tribe_id, amount, remaining, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        contractId, owner ? 'tribe' : 'reserve', owner ? tribes[owner] : null, amount, amount, start, end);

    // Альфа: разработка и тестирование, лимит у Розницы → сценарий 1 для Розницы, 2 для остальных
    const cA = contract('Д-2026/101', 'ООО «Альфа Софт»', [['Backend-разработчик', 3800], ['Frontend-разработчик', 3500], ['QA-инженер', 2800], ['Fullstack-разработчик', 3900]], '2026-01-01', '2027-12-31');
    limit(cA, 'Розничный бизнес', 60_000_000, '2026-01-01', '2027-12-31');
    // Бета: данные и DevOps, лимит у Платформы данных
    const cB = contract('Д-2026/102', 'ООО «Бета Системс»', [['Data Scientist', 4500], ['Data Engineer', 4200], ['DevOps-инженер', 4000], ['Backend-разработчик', 3700]], '2026-01-01', '2027-12-31');
    limit(cB, 'Платформа данных', 40_000_000, '2026-01-01', '2027-12-31');
    // Гамма: аналитика и мобильная разработка, лимит в резерве Блока Т
    const cC = contract('Д-2026/103', 'АО «Гамма Консалтинг»', [['Системный аналитик', 3300], ['Бизнес-аналитик', 3100], ['Mobile-разработчик', 3900]], '2026-01-01', '2027-12-31');
    limit(cC, null, 30_000_000, '2026-01-01', '2027-12-31');
    // Дельта: архитекторы (в бассейне их нет), лимит у Розницы → сценарий 4
    const cD = contract('Д-2026/104', 'ООО «Дельта Технологии»', [['Архитектор', 5200], ['DevOps-инженер', 4100]], '2026-03-01', '2027-12-31');
    limit(cD, 'Розничный бизнес', 15_000_000, '2026-03-01', '2027-12-31');
    // Эпсилон: Scrum (лимит у Корп. бизнеса), UX — резерв
    const cE = contract('Д-2026/105', 'ООО «Эпсилон Диджитал»', [['Scrum-мастер', 3000]], '2026-01-01', '2027-06-30');
    limit(cE, 'Корпоративный бизнес', 8_000_000, '2026-01-01', '2027-06-30');
    const cE2 = contract('Д-2026/106', 'ООО «Эпсилон Диджитал»', [['UX/UI-дизайнер', 3200]], '2026-01-01', '2027-06-30');
    limit(cE2, null, 6_000_000, '2026-01-01', '2027-06-30');
    // Зета: договора нет — кандидаты есть в бассейне, но привлечь их можно только через новый договор
    // Руководитель проекта — договоров нет вовсе → сценарий 7

    const rand = rng(42);
    const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
    const firstM = ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Михаил', 'Николай', 'Павел', 'Артём', 'Илья', 'Роман', 'Егор', 'Максим'];
    const firstF = ['Анна', 'Елена', 'Мария', 'Наталья', 'Ольга', 'Татьяна', 'Юлия', 'Ксения', 'Дарья', 'Екатерина'];
    const lastM = ['Петров', 'Соколов', 'Попов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Фёдоров', 'Михайлов', 'Орлов', 'Зайцев'];
    const patrM = ['Александрович', 'Сергеевич', 'Игоревич', 'Владимирович', 'Олегович', 'Андреевич'];
    const patrF = ['Александровна', 'Сергеевна', 'Игоревна', 'Владимировна', 'Олеговна', 'Андреевна'];
    const cities = ['Москва', 'Москва', 'Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург', 'Нижний Новгород', 'Удалённо'];

    const profiles: [string, string, string[]][] = [
      ['Backend-разработчик', 'ООО «Альфа Софт»', ['Java', 'Spring', 'PostgreSQL', 'Kafka', 'Docker', 'Kubernetes', 'Микросервисы', 'REST']],
      ['Backend-разработчик', 'ООО «Бета Системс»', ['Python', 'FastAPI', 'Django', 'PostgreSQL', 'Redis', 'Docker', 'REST']],
      ['Frontend-разработчик', 'ООО «Альфа Софт»', ['TypeScript', 'React', 'JavaScript', 'HTML', 'CSS', 'Next.js', 'REST']],
      ['Frontend-разработчик', 'ООО «Зета Лаб»', ['TypeScript', 'Vue', 'JavaScript', 'HTML', 'CSS']],
      ['QA-инженер', 'ООО «Альфа Софт»', ['Selenium', 'Playwright', 'Java', 'Python', 'Postman', 'SQL', 'JUnit']],
      ['DevOps-инженер', 'ООО «Бета Системс»', ['Kubernetes', 'Docker', 'Ansible', 'Terraform', 'GitLab CI', 'Linux', 'OpenShift']],
      ['Data Scientist', 'ООО «Бета Системс»', ['Python', 'PyTorch', 'Pandas', 'ML', 'NLP', 'SQL', 'LLM']],
      ['Data Engineer', 'ООО «Бета Системс»', ['Python', 'Spark', 'Airflow', 'Hadoop', 'Greenplum', 'SQL', 'Kafka']],
      ['Системный аналитик', 'АО «Гамма Консалтинг»', ['BPMN', 'UML', 'SQL', 'REST', 'Kafka', 'Confluence', 'Jira']],
      ['Бизнес-аналитик', 'АО «Гамма Консалтинг»', ['BPMN', 'Confluence', 'Jira', 'SQL']],
      ['Mobile-разработчик', 'АО «Гамма Консалтинг»', ['Kotlin', 'Android', 'Swift', 'iOS', 'Flutter']],
      ['UX/UI-дизайнер', 'ООО «Эпсилон Диджитал»', ['Figma']],
      ['Scrum-мастер', 'ООО «Эпсилон Диджитал»', ['Scrum', 'Kanban', 'Jira', 'Confluence']],
    ];
    const reviewsPool = [
      'Быстро погрузился в домен, качественно закрывает задачи спринта.',
      'Хорошая техническая база, стоит подтянуть коммуникацию с бизнесом.',
      'Самостоятельный, предлагает улучшения архитектуры.',
      'Аккуратно работает с документацией, задачи сдаёт в срок.',
      'Были задержки по срокам на старте, затем вышел на стабильный темп.',
    ];
    const sberProjects = ['СберБанк Онлайн', 'Кредитный конвейер', 'Фабрика данных', 'Платёжный шлюз', 'CRM корпоративного блока', 'Сбер ID'];

    let n = 0;
    for (const [role, vendor, skills] of profiles) {
      const count = role === 'Backend-разработчик' || role === 'Frontend-разработчик' ? 4 : 3;
      for (let i = 0; i < count; i++, n++) {
        const female = rand() < 0.4;
        const name = female
          ? `${pick(lastM)}а ${pick(firstF)} ${pick(patrF)}`
          : `${pick(lastM)} ${pick(firstM)} ${pick(patrM)}`;
        const level = (['Junior', 'Middle', 'Middle', 'Senior', 'Senior', 'Lead'] as const)[Math.floor(rand() * 6)];
        const exp = { Junior: 1 + rand() * 2, Middle: 3 + rand() * 3, Senior: 5 + rand() * 5, Lead: 8 + rand() * 7 }[level];
        const myskills = skills.filter(() => rand() < 0.7);
        if (myskills.length < 2) myskills.push(...skills.slice(0, 2).filter((s) => !myskills.includes(s)));
        const fromMonth = Math.floor(rand() * 5); // доступен с ноября 2026 по март 2027
        const from = new Date(Date.UTC(2026, 10 + fromMonth, 1 + Math.floor(rand() * 20)));
        const to = new Date(from);
        to.setUTCMonth(to.getUTCMonth() + 6 + Math.floor(rand() * 12));
        const baseRate = { Junior: 1800, Middle: 2800, Senior: 3800, Lead: 4800 }[level];
        const sber = rand() < 0.5 ? `${Math.max(1, Math.round(exp / 3))} г. — проект «${pick(sberProjects)}», роль: ${role}` : '';
        const reviews = sber
          ? [{ author: 'Руководитель команды', text: pick(reviewsPool), score: 3 + Math.round(rand() * 2), date: '2026-06-15' }]
          : [];
        const uvb = (['passed', 'passed', 'passed', 'in_progress', 'not_checked'] as const)[Math.floor(rand() * 5)];
        const status = n % 13 === 12 ? 'draft' : n % 17 === 16 ? 'archived' : 'active';
        run(
          `INSERT INTO candidates (status, full_name, age, role, level, skills, rating, available_from, available_to,
             total_experience, uvb_status, city, rate, sber_experience, resume_experience, reviews, vendor_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          status, name, Math.round(22 + exp + rand() * 8), role, level, json.str(myskills),
          Math.round((3 + rand() * 2) * 10) / 10,
          from.toISOString().slice(0, 10), to.toISOString().slice(0, 10),
          Math.round(exp * 10) / 10, uvb, pick(cities), Math.round((baseRate + rand() * 900) / 50) * 50,
          sber, `${Math.round(exp)} лет коммерческой разработки. Стек: ${myskills.join(', ')}.`,
          json.str(reviews), vendors[vendor], users.manager,
        );
      }
    }

    // Пример существующего объекта бэклога (mock-провайдер)
    run('INSERT INTO backlog_items (key, url, summary, description, created_by) VALUES (?, ?, ?, ?, ?)',
      'VH-1', 'https://jira.local/browse/VH-1', 'Онлайн-оформление кредитной карты в мобильном банке',
      'Реализовать сценарий подачи заявки на кредитную карту: анкета, скоринг, выдача решения, подписание через ПЭП.', users.customer);
  });
  return all('SELECT login FROM users');
}
