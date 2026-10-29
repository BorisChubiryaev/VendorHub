import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { freshDb } from './helpers.js';

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

async function call(path: string, opts: { token?: string; body?: unknown; method?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (l: string) => (await call('/api/auth/login', { body: { login: l, password: l } })).body.token as string;

before(async () => {
  freshDb();
  config.sberchat.botToken = 'bot-secret';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const position = (role: string, extra = {}) => ({ role, quantity: 1, skills: [], start_date: '2026-12-01', end_date: '2027-05-31', ...extra });

describe('API', () => {
  it('авторизация по логину и паролю', async () => {
    assert.equal((await call('/api/auth/login', { body: { login: 'customer', password: 'wrong' } })).status, 401);
    assert.equal((await call('/api/needs')).status, 401);
    const me = await call('/api/auth/me', { token: await login('customer') });
    assert.equal(me.body.login, 'customer');
  });

  it('разделение ролей', async () => {
    const manager = await login('manager');
    assert.equal((await call('/api/needs', { token: manager })).status, 403);
    const customer = await login('customer');
    assert.equal((await call('/api/candidates', { token: customer, body: { full_name: 'X' } })).status, 403);
    const list = await call('/api/candidates', { token: customer });
    assert.ok(list.body.every((c: any) => c.status === 'active'), 'заказчик видит только активные карточки');
  });

  it('полный цикл потребности: регистрация → подбор → маршрут → согласование', async () => {
    const token = await login('customer');
    const bad = await call('/api/needs', { token, body: { product: '', positions: [], submit: true } });
    assert.equal(bad.status, 400);
    assert.equal((await call('/api/needs', { token })).body.length, 0, 'при ошибке валидации черновик не создаётся');

    const created = await call('/api/needs', {
      token,
      body: { product: 'Мобильный банк', requirements_summary: 'Онлайн-вклады', submit: true,
        positions: [position('Backend-разработчик', { quantity: 2, skills: ['Java'] }), position('Руководитель проекта')] },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'matching');
    assert.equal(created.body.positions.length, 3, 'количество раскладывается на позиции фактической потребности');

    const id = created.body.id;
    const w = (await call(`/api/needs/${id}/wizard`, { token })).body;
    const backend = w.positions.find((p: any) => p.role === 'Backend-разработчик');
    assert.equal(backend.selected.case, 1);
    assert.equal(w.positions.find((p: any) => p.role === 'Руководитель проекта').selected.case, 7);

    // ручной выбор → «свой сценарий»
    const alt = backend.options.find((o: any) => o.key !== backend.selected.key && !w.positions.some((p: any) => p.candidate_id === o.candidate?.id));
    assert.equal((await call(`/api/positions/${backend.id}`, { token, method: 'PATCH', body: { option: alt.key } })).status, 200);
    assert.equal((await call(`/api/needs/${id}`, { token })).body.scenario, 'custom');

    // запуск на маршрут и передача в штаб
    await call(`/api/positions/${backend.id}`, { token, method: 'PATCH', body: { interview_required: true } });
    const launched = await call(`/api/needs/${id}/positions/launch`, { token, body: { ids: [backend.id] } });
    assert.equal(launched.body.need.status, 'in_hq');
    const route = launched.body.positions.find((p: any) => p.id === backend.id);
    assert.ok(route.route_steps.some((s: any) => s.step === 'interview'));
    for (let i = 0; i < route.route_steps.length; i++) await call(`/api/positions/${backend.id}/advance`, { token, body: { outcome: 'success' } });
    assert.equal((await call(`/api/needs/${id}`, { token })).body.positions.find((p: any) => p.id === backend.id).route_status, 'approved');

    // split
    const rest = launched.body.positions.filter((p: any) => p.route_status === 'not_started').map((p: any) => p.id);
    const split = await call(`/api/needs/${id}/split`, { token, body: { ids: [rest[0]] } });
    assert.equal((await call(`/api/needs/${split.body.id}`, { token })).body.parent_need_id, id);

    // чужая потребность недоступна
    assert.equal((await call(`/api/needs/${id}`, { token: await login('customer2') })).status, 403);
  });

  it('карточка кандидата: валидация активной карточки и поиск', async () => {
    const token = await login('manager');
    assert.equal((await call('/api/candidates', { token, body: { status: 'active', full_name: '' } })).status, 400);
    const c = await call('/api/candidates', { token, body: { status: 'active', full_name: 'Новиков Пётр', role: 'тестировщик', level: 'мидл', skills: ['питон'], vendor_id: 1 } });
    assert.equal(c.status, 201);
    assert.equal(c.body.role, 'QA-инженер');
    assert.equal(c.body.level, 'Middle');
    assert.deepEqual(c.body.skills, ['Python']);
    const found = await call(`/api/candidates?q=${encodeURIComponent('новиков')}`, { token });
    assert.ok(found.body.some((x: any) => x.id === c.body.id), 'регистронезависимый поиск по кириллице');
  });

  it('ассистент и вебхук СберЧата регистрируют потребность', async () => {
    const token = await login('customer');
    const s = (await call('/api/assistant/sessions', { token, body: {} })).body.sessionId;
    const say = (text: string) => call(`/api/assistant/sessions/${s}/messages`, { token, body: { text } });
    await say('Для продукта Кредитный конвейер нужно реализовать скоринг. Нужен senior бэкендер на Java с 1 декабря на полгода');
    const done = await say('Отправить на подбор');
    assert.ok(done.body.needId);
    const need = (await call(`/api/needs/${done.body.needId}`, { token })).body;
    assert.equal(need.status, 'matching');
    assert.equal(need.source, 'assistant');
    assert.ok(need.backlog_key, 'создан элемент бэклога');

    const hook = (text: string, headers = { 'X-Bot-Token': 'bot-secret' }) =>
      call('/api/integrations/sberchat/webhook', { headers, body: { chatId: 'c1', userLogin: 'customer', text } });
    assert.equal((await hook('привет', { 'X-Bot-Token': 'wrong' })).status, 401);
    await hook('Продукт: Вклады и счета. Задача: перевод вкладов на новую платформу. Нужен QA middle с 01.12.2026 по 31.03.2027');
    const r = await hook('Сохранить черновик');
    assert.ok(r.body.needId);
    assert.equal((await call(`/api/needs/${r.body.needId}`, { token })).body.source, 'sberchat');
  });
});
