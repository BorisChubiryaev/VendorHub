import { randomUUID } from 'node:crypto';
import { all, get, json, run } from '../../db/index.js';
import { normalizeLevel, normalizeRole, normalizeSkill } from '../../lib/dictionaries.js';
import { backlog, ensureBacklogItem } from '../backlog/index.js';
import { llmJson, llmEnabled } from '../llm.js';
import { CASE_INFO, type SupplyOption } from '../matching.js';
import { createNeed, submitNeed, wizard, type SessionUser } from '../needs.js';
import { extract, isCancel, isNo, isReset, isSubmit, isYes, parseDates, type DraftPosition, type Extracted } from './nlu.js';

type Field = 'product' | 'requirements' | 'positions' | 'dates';

interface Draft {
  product: string | null;
  requirements: string | null;
  backlogKey: string | null;
  backlogUrl: string | null;
  backlogSummary: string | null;
  positions: DraftPosition[];
}

interface State {
  stage: 'collect' | 'confirm' | 'done';
  awaiting: Field | null;
  draft: Draft;
  needId?: number;
}

export interface ChatMessage {
  from: 'user' | 'bot';
  text: string;
  at: string;
  actions?: string[];
  link?: { label: string; href: string };
}

const emptyDraft = (): Draft => ({ product: null, requirements: null, backlogKey: null, backlogUrl: null, backlogSummary: null, positions: [] });
const newState = (): State => ({ stage: 'collect', awaiting: null, draft: emptyDraft() });

const GREETING =
  'Здравствуйте! Я помогу зарегистрировать потребность в ИТ-ресурсах. Опишите её в свободной форме: ' +
  'для какого продукта, что нужно сделать (или ссылку на задачу в Jira/СберТреке), каких специалистов, сколько и на какой срок.\n\n' +
  'Например: «Для продукта Мобильный банк нужно реализовать онлайн-оформление вкладов. Нужны 2 senior backend-разработчика (Java, Kafka) и один QA middle с 1 декабря по 31 мая».';

const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('.') : '—');

function summary(d: Draft) {
  const lines = [
    `• Продукт: ${d.product ?? '—'}`,
    `• Требования: ${d.backlogKey ? `${d.backlogKey} — ${d.backlogSummary ?? ''}` : d.requirements ?? '—'}`,
    '• Ролевой состав:',
    ...d.positions.map((p, i) =>
      `   ${i + 1}. ${p.role}${p.level ? ' ' + p.level : ''} × ${p.quantity}` +
      `${p.skills.length ? ' — ' + p.skills.join(', ') : ''}; ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`),
  ];
  return lines.join('\n');
}

function missingField(d: Draft): Field | null {
  if (!d.product) return 'product';
  if (!d.requirements && !d.backlogKey) return 'requirements';
  if (!d.positions.length) return 'positions';
  if (d.positions.some((p) => !p.start_date || !p.end_date)) return 'dates';
  return null;
}

const QUESTIONS: Record<Field, string> = {
  product: 'Для какого продукта нужны специалисты?',
  requirements: 'Опишите кратко, что нужно реализовать (функциональные требования), или пришлите ссылку/ключ задачи в Jira/СберТреке. Если задачи ещё нет — создам её сам.',
  positions: 'Каких специалистов и сколько нужно? Например: «2 backend-разработчика senior (Java, Spring) и 1 системный аналитик».',
  dates: 'На какой срок нужны специалисты? Например: «с 01.12.2026 по 31.05.2027» или «с января на 6 месяцев».',
};

async function llmExtract(text: string, state: State, products: string[]): Promise<Partial<Extracted> | null> {
  if (!llmEnabled()) return null;
  const today = new Date().toISOString().slice(0, 10);
  const r = await llmJson<any>(
    `Ты помогаешь заказчику ИТ-ресурсов оформить потребность. Сегодня ${today}. Извлеки из сообщения пользователя данные и верни строго JSON:
{"product": string|null, "requirements": string|null, "backlogRef": string|null,
 "positions": [{"role": string, "level": "Junior"|"Middle"|"Senior"|"Lead"|null, "quantity": number, "skills": string[], "start_date": "YYYY-MM-DD"|null, "end_date": "YYYY-MM-DD"|null}],
 "dates": {"start": "YYYY-MM-DD"|null, "end": "YYYY-MM-DD"|null}}
Известные продукты: ${products.join(', ')}. Сейчас бот ожидает: ${state.awaiting ?? 'любые данные'}. Если сведений нет — null или пустой массив.`,
    text,
  );
  if (!r) return null;
  return {
    product: r.product ?? null,
    requirements: r.requirements ?? null,
    backlogRef: r.backlogRef ?? null,
    positions: Array.isArray(r.positions)
      ? r.positions.filter((p: any) => p?.role).map((p: any) => ({
        role: normalizeRole(p.role) ?? p.role, level: normalizeLevel(p.level), quantity: Number(p.quantity) || 1,
        skills: (p.skills ?? []).map(normalizeSkill), start_date: p.start_date ?? null, end_date: p.end_date ?? null,
      }))
      : [],
    dates: r.dates ?? { start: null, end: null },
  };
}

async function merge(state: State, text: string): Promise<string[]> {
  const notes: string[] = [];
  const products = all<{ name: string }>('SELECT name FROM products').map((p) => p.name);
  const rule = extract(text, products);
  const ai = await llmExtract(text, state, products);
  const x: Extracted = {
    product: ai?.product ?? rule.product,
    requirements: ai?.requirements ?? rule.requirements,
    backlogRef: ai?.backlogRef ?? rule.backlogRef,
    positions: ai?.positions?.length ? ai.positions : rule.positions,
    dates: { start: ai?.dates?.start ?? rule.dates.start, end: ai?.dates?.end ?? rule.dates.end },
  };
  const d = state.draft;
  const trimmed = text.trim().replace(/^[«"“]|[»"”]$/g, '');
  const nothingFound = !x.product && !x.requirements && !x.backlogRef && !x.positions.length && !x.dates.start && !x.dates.end;

  // Ответ на конкретный вопрос бота трактуем как значение поля
  if (!x.product && state.awaiting === 'product' && trimmed.length <= 80 && !x.positions.length) x.product = trimmed;
  if (!x.requirements && !x.backlogRef && state.awaiting === 'requirements' && nothingFound) x.requirements = trimmed;
  if (!x.requirements && !x.backlogRef && !d.requirements && !d.backlogKey && trimmed.length > 60 && x.positions.length === 0 && x.product) {
    x.requirements = trimmed; // длинное описание без явных маркеров
  }

  if (x.product) d.product = x.product;
  if (x.requirements) d.requirements = x.requirements;
  if (x.backlogRef) {
    const item = await backlog().find(x.backlogRef);
    if (item) {
      Object.assign(d, { backlogKey: item.key, backlogUrl: item.url, backlogSummary: item.summary });
      notes.push(`Нашёл задачу ${item.key}: «${item.summary}».`);
    } else {
      notes.push(`Не нашёл в бэклоге объект ${x.backlogRef}. Опишите требования текстом — я создам задачу.`);
    }
  }
  if (x.positions.length) d.positions.push(...x.positions);
  const start = x.dates.start;
  const end = x.dates.end;
  if (start || end) {
    for (const p of d.positions) {
      if (!p.start_date && start) p.start_date = start;
      if (!p.end_date && end) p.end_date = end;
    }
  }
  if (nothingFound && !x.product && !x.requirements && state.awaiting) notes.push('Не удалось разобрать ответ.');
  return notes;
}

function applyEdits(state: State, text: string): boolean {
  const remove = text.match(/(?:убери|удали|исключи)\s+позици[юя]\s+(\d+)/i);
  if (remove) {
    const i = Number(remove[1]) - 1;
    if (state.draft.positions[i]) state.draft.positions.splice(i, 1);
    return true;
  }
  const dates = text.match(/(?:срок|сроки|даты)/i) ? parseDates(text) : null;
  if (dates?.start && dates.end) {
    for (const p of state.draft.positions) Object.assign(p, { start_date: dates.start, end_date: dates.end });
    return true;
  }
  return false;
}

async function register(state: State, user: SessionUser, submit: boolean, channel: string): Promise<ChatMessage[]> {
  const d = state.draft;
  const out: ChatMessage[] = [];
  let backlogNote = '';
  if (!d.backlogKey && d.requirements) {
    const { item, created } = await ensureBacklogItem({
      summary: `${d.product}: ${d.requirements}`.slice(0, 250),
      description: d.requirements,
      userId: user.id,
    });
    Object.assign(d, { backlogKey: item.key, backlogUrl: item.url, backlogSummary: item.summary });
    backlogNote = created ? `Создал задачу в бэклоге: ${item.key}.` : `Нашёл существующую задачу в бэклоге: ${item.key}.`;
  }
  const needId = createNeed(user, {
    product: d.product ?? '',
    backlog_key: d.backlogKey,
    backlog_url: d.backlogUrl,
    requirements_summary: d.requirements ?? d.backlogSummary,
    positions: d.positions,
  }, channel === 'sberchat' ? 'sberchat' : 'assistant');
  state.needId = needId;
  state.stage = 'done';
  const link = { label: `Потребность #${needId}`, href: `/needs/${needId}` };
  if (!submit) {
    out.push(msg(`${backlogNote} Черновик потребности #${needId} сохранён. Его можно доработать в веб-интерфейсе и отправить на подбор.`.trim(), { link }));
    return out;
  }
  submitNeed(needId, user);
  const w = wizard(needId, user);
  const lines = w.positions.map((p, i) => {
    const o = p.selected as SupplyOption | null;
    if (!o) return `${i + 1}. ${p.role}: вариантов не найдено`;
    const who = o.candidate ? `${o.candidate.full_name} (релевантность ${o.relevance?.score}%)` : o.contract ? `запрос у ${o.contract.vendorName}` : 'новый договор';
    return `${i + 1}. ${p.role}: ${who} — ${CASE_INFO[o.case].banner}`;
  });
  out.push(msg(
    `${backlogNote} Потребность #${needId} зарегистрирована и отправлена на подбор. Сценарий «Лучшее совпадение»:\n${lines.join('\n')}\n\n` +
    'Откройте карточку, чтобы сравнить сценарии, заменить кандидатов и запустить позиции на маршрут.',
    { link },
  ));
  return out;
}

const msg = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ from: 'bot', text: text.trim(), at: new Date().toISOString(), ...extra });

function loadSession(id: string, userId: number) {
  const row = get<any>('SELECT * FROM assistant_sessions WHERE id = ? AND user_id = ?', id, userId);
  return row ? { state: json.parse<State>(row.state, newState()), messages: json.parse<ChatMessage[]>(row.messages, []) } : null;
}

function saveSession(id: string, userId: number, channel: string, state: State, messages: ChatMessage[]) {
  run(
    `INSERT INTO assistant_sessions (id, user_id, channel, state, messages, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET state = excluded.state, messages = excluded.messages, updated_at = excluded.updated_at`,
    id, userId, channel, json.str(state), json.str(messages.slice(-100)),
  );
}

export function startSession(user: SessionUser, channel = 'web', id: string = randomUUID()) {
  const messages = [msg(GREETING)];
  saveSession(id, user.id, channel, newState(), messages);
  return { sessionId: id, messages };
}

export function getSession(id: string, user: SessionUser) {
  const s = loadSession(id, user.id);
  return s ? { sessionId: id, messages: s.messages, draft: s.state.draft, stage: s.state.stage } : null;
}

/** Обработка реплики пользователя. Возвращает новые сообщения бота. */
export async function handleMessage(user: SessionUser, sessionId: string, text: string, channel = 'web') {
  const session = loadSession(sessionId, user.id) ?? { state: newState(), messages: [] as ChatMessage[] };
  let { state } = session;
  const messages = session.messages;
  messages.push({ from: 'user', text, at: new Date().toISOString() });
  const replies: ChatMessage[] = [];

  if (isReset(text)) {
    state = newState();
    replies.push(msg(GREETING));
  } else if (isCancel(text)) {
    state = newState();
    replies.push(msg('Регистрация отменена. Чтобы начать заново, просто опишите новую потребность.'));
  } else {
    if (state.stage === 'done') state = newState();
    if (state.stage === 'confirm' && (isYes(text) || isSubmit(text))) {
      replies.push(...(await register(state, user, isSubmit(text), channel)));
    } else {
      const notes: string[] = [];
      if (state.stage === 'confirm' && isNo(text)) {
        replies.push(msg('Что изменить? Можно написать, например: «продукт — Кредитный конвейер», «добавь 1 QA middle», «убери позицию 2», «сроки с 01.12.2026 по 31.05.2027».'));
      } else {
        if (!(state.stage === 'confirm' && applyEdits(state, text))) notes.push(...(await merge(state, text)));
        const missing = missingField(state.draft);
        if (missing) {
          state.stage = 'collect';
          state.awaiting = missing;
          const progress = state.draft.product || state.draft.positions.length ? `Пока записал:\n${summary(state.draft)}\n\n` : '';
          replies.push(msg(`${notes.join(' ')}\n${progress}${QUESTIONS[missing]}`));
        } else {
          state.stage = 'confirm';
          state.awaiting = null;
          replies.push(msg(
            `${notes.join(' ')}\nПроверьте потребность:\n${summary(state.draft)}\n\n` +
            'Всё верно? «Сохранить черновик» — сохраню без подбора, «Отправить на подбор» — зарегистрирую и сразу подберу варианты. Или напишите, что изменить.',
            { actions: ['Сохранить черновик', 'Отправить на подбор', 'Изменить'] },
          ));
        }
      }
    }
  }
  messages.push(...replies);
  saveSession(sessionId, user.id, channel, state, messages);
  return { sessionId, replies, draft: state.draft, stage: state.stage, needId: state.needId };
}
