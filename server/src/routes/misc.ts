import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { all, get } from '../db/index.js';
import { login, me, publicUser, loadUser, requireAuth } from '../lib/auth.js';
import { CANDIDATE_STATUSES, CITIES, LEVELS, NEED_STATUSES, ROLES, SKILLS, UVB_STATUSES } from '../lib/dictionaries.js';
import { h, HttpError } from '../lib/http.js';
import { getSession, handleMessage, startSession } from '../services/assistant/engine.js';
import { backlog, ensureBacklogItem } from '../services/backlog/index.js';
import { logInbound } from '../services/integrations.js';
import { llmEnabled } from '../services/llm.js';
import { CASE_INFO, SCENARIOS } from '../services/matching.js';
import { advancePosition } from '../services/needs.js';
import { ROUTE_STATUSES } from '../services/routing.js';

export const authRouter = Router();

authRouter.post('/login', h((req) => {
  const body = z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(req.body);
  return login(body.login, body.password);
}));
authRouter.get('/me', requireAuth, h((req) => me(req)));

export const dictionariesRouter = Router();
dictionariesRouter.get('/', h((req) => {
  const user = me(req);
  return {
    roles: ROLES.map((r) => r.name),
    levels: LEVELS,
    skills: SKILLS,
    cities: CITIES,
    vendors: all('SELECT id, name, inn FROM vendors ORDER BY name'),
    products: all<any>('SELECT p.id, p.name, p.tribe_id, t.name AS tribe_name FROM products p LEFT JOIN tribes t ON t.id = p.tribe_id ORDER BY (p.tribe_id = ?) DESC, p.name', user.tribe_id ?? 0),
    creators: all<any>('SELECT id, full_name, roles FROM users ORDER BY full_name').filter((u) => u.roles.includes('pool_manager')).map(({ id, full_name }) => ({ id, full_name })),
    candidateStatuses: CANDIDATE_STATUSES,
    uvbStatuses: UVB_STATUSES,
    needStatuses: NEED_STATUSES,
    routeStatuses: ROUTE_STATUSES,
    cases: CASE_INFO,
    scenarios: SCENARIOS,
    features: { llm: llmEnabled(), backlogProvider: config.backlog.provider, maxUploadMb: config.maxUploadMb, ephemeral: config.ephemeral },
  };
}));

export const backlogRouter = Router();
backlogRouter.get('/lookup', h(async (req) => {
  const ref = String(req.query.ref ?? '');
  const item = await backlog().find(ref);
  if (!item) throw new HttpError(404, `Объект бэклога «${ref}» не найден`);
  return item;
}));
backlogRouter.get('/search', h(async (req) => backlog().search(String(req.query.q ?? ''))));
backlogRouter.post('/', h(async (req) => {
  const body = z.object({ summary: z.string().trim().min(5, 'слишком короткое название'), description: z.string().default('') }).parse(req.body);
  return ensureBacklogItem({ ...body, userId: me(req).id });
}));

export const assistantRouter = Router();
assistantRouter.post('/sessions', h((req) => startSession(me(req))));
assistantRouter.get('/sessions/:id', h((req) => {
  const s = getSession(String(req.params.id), me(req));
  if (!s) throw new HttpError(404, 'Диалог не найден');
  return s;
}));
assistantRouter.post('/sessions/:id/messages', h(async (req) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
  return handleMessage(me(req), String(req.params.id), text);
}));

/**
 * Входящие интеграции. Авторизация — сервисными токенами из конфигурации.
 *  - СберЧат: бот пересылает реплики пользователя, ответ возвращается в теле (и, если задан SBERCHAT_OUTBOUND_URL, отправляется туда).
 *  - callback: ответы внешних систем по шагам маршрута (Пульс, Пульс.Подбор, модуль лимитов, ЛК).
 */
export const integrationsRouter = Router();

integrationsRouter.post('/sberchat/webhook', h(async (req) => {
  if (!config.sberchat.botToken) throw new HttpError(503, 'Интеграция со СберЧатом не настроена (SBERCHAT_BOT_TOKEN)');
  if (req.headers['x-bot-token'] !== config.sberchat.botToken) throw new HttpError(401, 'Неверный токен бота');
  const body = z.object({ chatId: z.string().min(1), userLogin: z.string().min(1), text: z.string().min(1).max(4000) }).parse(req.body);
  const user = loadUser('login', body.userLogin.toLowerCase());
  if (!user || !user.roles.includes('customer')) throw new HttpError(403, 'Пользователь не зарегистрирован в ВендорХабе как заказчик');
  const sessionId = `sberchat:${body.chatId}`;
  if (!getSession(sessionId, user)) startSession(publicUser(user), 'sberchat', sessionId);
  logInbound('sberchat', 'chat', null, body);
  const r = await handleMessage(publicUser(user), sessionId, body.text, 'sberchat');
  const replies = r.replies.map((m) => (m.link ? `${m.text}\n${m.link.label}: ${m.link.href}` : m.text));
  if (config.sberchat.outboundUrl) {
    fetch(config.sberchat.outboundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Token': config.sberchat.botToken },
      body: JSON.stringify({ chatId: body.chatId, messages: replies }),
    }).catch((e) => console.error('СберЧат: ошибка отправки ответа', e));
  }
  return { chatId: body.chatId, replies, needId: r.needId ?? null };
}));

integrationsRouter.post('/callback', h((req) => {
  if (!config.integrationToken) throw new HttpError(503, 'Callback-интеграции не настроены (INTEGRATION_TOKEN)');
  if (req.headers['x-integration-token'] !== config.integrationToken) throw new HttpError(401, 'Неверный токен интеграции');
  const body = z.object({ positionId: z.number().int(), outcome: z.enum(['success', 'fail']), system: z.string().optional() }).parse(req.body);
  if (!get('SELECT 1 FROM need_positions WHERE id = ?', body.positionId)) throw new HttpError(404, 'Позиция не найдена');
  return { status: advancePosition(body.positionId, body.outcome, body.system ?? 'callback') };
}));
