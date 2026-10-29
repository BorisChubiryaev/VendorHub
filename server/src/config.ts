import path from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  dbPath: env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'vendorhub.db'),
  uploadDir: env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'data', 'uploads'),
  webDist: env.WEB_DIST ?? path.resolve(process.cwd(), '..', 'web', 'dist'),
  jwtSecret: env.JWT_SECRET ?? 'vendorhub-dev-secret-change-me',
  jwtTtl: env.JWT_TTL ?? '12h',
  seedDemoData: (env.SEED_DEMO_DATA ?? 'true') === 'true',
  // Часов в месяце для оценки бюджета позиции
  hoursPerMonth: Number(env.HOURS_PER_MONTH ?? 160),
  backlog: {
    provider: (env.BACKLOG_PROVIDER ?? 'mock') as 'mock' | 'jira',
    jiraUrl: env.JIRA_URL ?? '',
    jiraToken: env.JIRA_TOKEN ?? '',
    jiraProject: env.JIRA_PROJECT ?? '',
    jiraIssueType: env.JIRA_ISSUE_TYPE ?? 'Story',
  },
  llm: {
    // OpenAI-совместимый endpoint (например, шлюз к GigaChat). Пусто — работает rule-based разбор.
    apiUrl: env.LLM_API_URL ?? '',
    apiKey: env.LLM_API_KEY ?? '',
    model: env.LLM_MODEL ?? 'GigaChat',
  },
  // Токен для callback'ов внешних систем (Пульс, ЛК, модуль лимитов) — заголовок X-Integration-Token
  integrationToken: env.INTEGRATION_TOKEN ?? '',
  sberchat: {
    // Токен, которым бот СберЧата подписывает входящие запросы (заголовок X-Bot-Token)
    botToken: env.SBERCHAT_BOT_TOKEN ?? '',
    outboundUrl: env.SBERCHAT_OUTBOUND_URL ?? '',
  },
};
