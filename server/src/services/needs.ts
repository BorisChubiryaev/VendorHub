import { all, get, json, likeParam, run, tx } from '../db/index.js';
import { normalizeLevel, normalizeRole, normalizeSkill } from '../lib/dictionaries.js';
import { HttpError } from '../lib/http.js';
import { eventsFor, sendToSystem } from './integrations.js';
import {
  buildScenario, candidateOption, findOptions, loadContext, mapCandidate, SCENARIOS,
  type Ctx, type OptionCase, type ScenarioKey, type SupplyOption,
} from './matching.js';
import { advanceRoute, buildRoute, initialStatus, ROUTE_STATUSES, STEP_INFO, TERMINAL_FAIL, type RouteStep, type RouteStatus } from './routing.js';

export interface PositionData {
  role: string;
  level?: string | null;
  quantity?: number;
  skills?: string[];
  start_date?: string | null;
  end_date?: string | null;
  interview_required?: boolean;
}

export interface NeedData {
  product?: string;
  backlog_key?: string | null;
  backlog_url?: string | null;
  requirements_summary?: string | null;
  positions?: PositionData[];
}

export interface SessionUser {
  id: number;
  login: string;
  full_name: string;
  roles: string[];
  tribe_id: number | null;
  tribe_name?: string | null;
}

const EDITABLE_ROUTE: RouteStatus[] = ['not_started', ...TERMINAL_FAIL];

function mapPosition(p: any) {
  return {
    ...p,
    skills: json.parse<string[]>(p.skills, []),
    interview_required: !!p.interview_required,
    route_steps: json.parse<RouteStep[]>(p.route_steps, []).map((s) => ({ ...s, title: STEP_INFO[s.step].title })),
    route_status_name: ROUTE_STATUSES[p.route_status as RouteStatus] ?? p.route_status,
  };
}
export type Position = ReturnType<typeof mapPosition>;

export function loadNeed(id: number) {
  const need = get<any>(
    `SELECT n.*, u.full_name AS initiator_name, t.name AS tribe_name
       FROM needs n JOIN users u ON u.id = n.initiator_id LEFT JOIN tribes t ON t.id = n.tribe_id WHERE n.id = ?`, id,
  );
  if (!need) throw new HttpError(404, 'Потребность не найдена');
  const positions = all<any>('SELECT * FROM need_positions WHERE need_id = ? ORDER BY sort_order, id', id).map(mapPosition);
  return { ...need, positions };
}
export type Need = ReturnType<typeof loadNeed>;

export function needForUser(id: number, user: SessionUser) {
  const need = loadNeed(id);
  if (need.initiator_id !== user.id && !user.roles.includes('admin')) throw new HttpError(403, 'Это потребность другого пользователя');
  return need;
}

function cleanPosition(p: PositionData) {
  return {
    role: normalizeRole(p.role) ?? p.role,
    level: normalizeLevel(p.level ?? null),
    quantity: Math.max(1, Math.min(50, Math.round(p.quantity ?? 1))),
    skills: [...new Set((p.skills ?? []).map((s) => normalizeSkill(s)).filter(Boolean))],
    start_date: p.start_date || null,
    end_date: p.end_date || null,
    interview_required: p.interview_required ? 1 : 0,
  };
}

function insertPositions(needId: number, positions: PositionData[]) {
  positions.forEach((raw, i) => {
    const p = cleanPosition(raw);
    run(
      `INSERT INTO need_positions (need_id, role, level, quantity, skills, start_date, end_date, interview_required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      needId, p.role, p.level, p.quantity, json.str(p.skills), p.start_date, p.end_date, p.interview_required, i,
    );
  });
}

export function createNeed(user: SessionUser, data: NeedData, source = 'web') {
  return tx(() => {
    const { id } = run(
      `INSERT INTO needs (initiator_id, tribe_id, product, backlog_key, backlog_url, requirements_summary, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.id, user.tribe_id, data.product?.trim() ?? '', data.backlog_key ?? null, data.backlog_url ?? null,
      data.requirements_summary ?? null, source,
    );
    insertPositions(id, data.positions ?? []);
    return id;
  });
}

export function updateDraft(id: number, user: SessionUser, data: NeedData) {
  const need = needForUser(id, user);
  if (need.status !== 'draft') throw new HttpError(409, 'Редактировать можно только черновик');
  tx(() => {
    run(
      `UPDATE needs SET product = ?, backlog_key = ?, backlog_url = ?, requirements_summary = ?, updated_at = datetime('now') WHERE id = ?`,
      data.product?.trim() ?? need.product, data.backlog_key ?? null, data.backlog_url ?? null, data.requirements_summary ?? null, id,
    );
    if (data.positions) {
      run('DELETE FROM need_positions WHERE need_id = ?', id);
      insertPositions(id, data.positions);
    }
  });
}

export function validateForSubmit(need: Pick<Need, 'product' | 'backlog_key' | 'requirements_summary' | 'positions'>): string[] {
  const errors: string[] = [];
  if (!need.product?.trim()) errors.push('Не указан продукт');
  if (!need.backlog_key && !need.requirements_summary?.trim()) errors.push('Не указаны требования: ссылка на объект бэклога или описание');
  if (!need.positions.length) errors.push('Добавьте хотя бы одну позицию ролевого состава');
  need.positions.forEach((p: Pick<Position, 'role' | 'start_date' | 'end_date'>, i: number) => {
    const n = i + 1;
    if (!p.role) errors.push(`Позиция ${n}: не указана роль`);
    if (!p.start_date || !p.end_date) errors.push(`Позиция ${n}: укажите даты начала и окончания работ`);
    else if (p.end_date < p.start_date) errors.push(`Позиция ${n}: дата окончания раньше даты начала`);
  });
  return errors;
}

/** Отправка на подбор: позиции раскладываются по одному человеку, подбираются варианты, применяется сценарий «лучшее совпадение». */
export function submitNeed(id: number, user: SessionUser) {
  const need = needForUser(id, user);
  if (need.status !== 'draft') throw new HttpError(409, 'Потребность уже отправлена на подбор');
  const errors = validateForSubmit(need);
  if (errors.length) throw new HttpError(400, errors.join('; '), { errors });
  tx(() => {
    for (const p of need.positions as Position[]) {
      for (let k = 1; k < p.quantity; k++) {
        run(
          `INSERT INTO need_positions (need_id, role, level, quantity, skills, start_date, end_date, interview_required, sort_order)
           VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
          id, p.role, p.level, json.str(p.skills), p.start_date, p.end_date, p.interview_required ? 1 : 0, p.sort_order,
        );
      }
      run('UPDATE need_positions SET quantity = 1 WHERE id = ?', p.id);
    }
    run(`UPDATE needs SET status = 'matching', submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, id);
  });
  applyScenario(id, user, 'best');
}

export function cancelNeed(id: number, user: SessionUser) {
  const need = needForUser(id, user);
  if ((need.positions as Position[]).some((p) => !EDITABLE_ROUTE.includes(p.route_status))) {
    throw new HttpError(409, 'По части позиций уже запущен маршрут — отмена невозможна');
  }
  run(`UPDATE needs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`, id);
}

function positionOptions(ctx: Ctx, p: Position) {
  return findOptions(ctx, p);
}

/** Текущий выбранный вариант позиции, восстановленный из сохранённых полей. */
function currentOption(ctx: Ctx, p: Position, options: SupplyOption[]): SupplyOption | null {
  if (!p.option_case) return null;
  const key = p.candidate_id ? `c:${p.candidate_id}` : p.option_case === 7 ? 'new' : `v:${p.contract_id}`;
  const found = options.find((o) => o.key === key);
  if (found) return found;
  // Кандидат мог быть выбран вручную (вне топа) или уже выведен из бассейна — пересчитываем точечно
  if (p.candidate_id) {
    const c = get<any>('SELECT c.*, v.name AS vendor_name FROM candidates c LEFT JOIN vendors v ON v.id = c.vendor_id WHERE c.id = ?', p.candidate_id);
    if (c) return candidateOption(ctx, p, mapCandidate(c), { requireRole: false });
  }
  return null;
}

/** Данные для визарда выбора способа обеспечения. */
export function wizard(id: number, user: SessionUser) {
  const need = needForUser(id, user);
  const ctx = loadContext(need.tribe_id);
  const positions = (need.positions as Position[]).map((p) => {
    const options = positionOptions(ctx, p);
    const selected = currentOption(ctx, p, options);
    return { ...p, selected, options: options.slice(0, 12), optionsTotal: options.length };
  });
  const total = positions.reduce((s, p) => s + (p.selected?.estimatedCost ?? 0), 0);
  const events = eventsFor('position', positions.map((p) => p.id)).concat(eventsFor('need', [id]));
  return { need: { ...need, positions: undefined }, positions, scenarios: SCENARIOS, totalCost: total, events };
}

function saveOption(positionId: number, o: SupplyOption) {
  run(
    `UPDATE need_positions SET option_case = ?, candidate_id = ?, contract_id = ?, limit_id = ?, relevance = ? WHERE id = ?`,
    o.case, o.candidate?.id ?? null, o.contract?.id ?? null, o.limit?.id ?? null, o.relevance?.score ?? null, positionId,
  );
}

export function applyScenario(id: number, user: SessionUser, scenario: ScenarioKey) {
  const need = needForUser(id, user);
  if (!['matching', 'in_hq'].includes(need.status)) throw new HttpError(409, 'Сценарии доступны после отправки на подбор');
  const ctx = loadContext(need.tribe_id);
  const editable = (need.positions as Position[]).filter((p) => EDITABLE_ROUTE.includes(p.route_status));
  // Кандидаты, уже идущие по маршруту в других позициях, недоступны
  const busy = new Set((need.positions as Position[]).filter((p) => !EDITABLE_ROUTE.includes(p.route_status)).map((p) => p.candidate_id));
  const input = editable.map((p) => ({ id: p.id, options: positionOptions(ctx, p).filter((o) => !o.candidate || !busy.has(o.candidate.id)) }));
  const chosen = buildScenario(scenario, input);
  tx(() => {
    for (const [pid, o] of Object.entries(chosen)) saveOption(Number(pid), o);
    run(`UPDATE needs SET scenario = ?, updated_at = datetime('now') WHERE id = ?`, scenario, id);
  });
}

export function positionOf(positionId: number, user: SessionUser) {
  const p = get<any>('SELECT * FROM need_positions WHERE id = ?', positionId);
  if (!p) throw new HttpError(404, 'Позиция не найдена');
  const need = needForUser(p.need_id, user);
  return { need, position: mapPosition(p) as Position };
}

/** Выбор варианта: optionKey = c:<candidateId> | v:<contractId> | new. Переводит потребность в «свой сценарий». */
export function selectOption(positionId: number, user: SessionUser, optionKey: string) {
  const { need, position } = positionOf(positionId, user);
  if (!EDITABLE_ROUTE.includes(position.route_status)) throw new HttpError(409, 'По позиции уже запущен маршрут');
  const ctx = loadContext(need.tribe_id);
  let option: SupplyOption | null | undefined = findOptions(ctx, position).find((o) => o.key === optionKey);
  if (!option && optionKey.startsWith('c:')) {
    // ручной выбор кандидата из поиска — роль может не совпадать дословно
    const c = get<any>(`SELECT c.*, v.name AS vendor_name FROM candidates c LEFT JOIN vendors v ON v.id = c.vendor_id WHERE c.id = ? AND c.status = 'active'`, Number(optionKey.slice(2)));
    if (!c) throw new HttpError(404, 'Кандидат не найден или карточка неактивна');
    option = candidateOption(ctx, position, mapCandidate(c), { requireRole: false });
    if (!option) throw new HttpError(409, 'Кандидата нельзя привлечь: нет договора с лимитом, покрывающего интервал позиции, или кандидат недоступен в эти даты');
  }
  if (!option) throw new HttpError(404, 'Вариант обеспечения не найден');
  if (option.candidate) {
    const taken = (need.positions as Position[]).find((p) => p.id !== positionId && p.candidate_id === option!.candidate!.id);
    if (taken) throw new HttpError(409, 'Этот кандидат уже выбран на другую позицию потребности');
  }
  tx(() => {
    saveOption(positionId, option!);
    if (TERMINAL_FAIL.includes(position.route_status)) resetRoute(positionId);
    run(`UPDATE needs SET scenario = 'custom', updated_at = datetime('now') WHERE id = ?`, need.id);
  });
}

export function setInterview(positionId: number, user: SessionUser, required: boolean) {
  const { position } = positionOf(positionId, user);
  if (!EDITABLE_ROUTE.includes(position.route_status)) throw new HttpError(409, 'По позиции уже запущен маршрут');
  run('UPDATE need_positions SET interview_required = ? WHERE id = ?', required ? 1 : 0, positionId);
}

function resetRoute(positionId: number) {
  run(`UPDATE need_positions SET route_status = 'not_started', route_steps = NULL, route_scenario = NULL, route_started_at = NULL WHERE id = ?`, positionId);
}

function selected(need: Need, ids: number[]) {
  const positions = (need.positions as Position[]).filter((p) => ids.includes(p.id));
  if (!positions.length) throw new HttpError(400, 'Не выбраны позиции');
  return positions;
}

export function deletePositions(id: number, user: SessionUser, ids: number[]) {
  const need = needForUser(id, user);
  const positions = selected(need, ids);
  if (positions.some((p) => !EDITABLE_ROUTE.includes(p.route_status))) throw new HttpError(409, 'Нельзя удалить позиции, запущенные на маршрут');
  if (positions.length === need.positions.length) throw new HttpError(409, 'Нельзя удалить все позиции — отмените потребность целиком');
  for (const p of positions) run('DELETE FROM need_positions WHERE id = ?', p.id);
}

/** Запуск выбранных позиций на маршрут: формирование шагов по сценарию А–Ж и передача потребности в штаб. */
export function launchRoute(id: number, user: SessionUser, ids: number[]) {
  const need = needForUser(id, user);
  const positions = selected(need, ids);
  for (const p of positions) {
    if (!EDITABLE_ROUTE.includes(p.route_status)) throw new HttpError(409, `Позиция «${p.role}» уже на маршруте`);
    if (!p.option_case) throw new HttpError(409, `Для позиции «${p.role}» не выбран способ обеспечения`);
  }
  tx(() => {
    for (const p of positions) {
      const { scenario, steps } = buildRoute(p.option_case as OptionCase, p.interview_required);
      run(
        `UPDATE need_positions SET route_scenario = ?, route_steps = ?, route_status = ?, route_started_at = datetime('now') WHERE id = ?`,
        scenario, json.str(steps), initialStatus(steps), p.id,
      );
      sendToSystem(steps[0].system, 'position', p.id, {
        step: steps[0].step, title: STEP_INFO[steps[0].step].title, needId: id, role: p.role,
        candidateId: p.candidate_id, contractId: p.contract_id, limitId: p.limit_id,
      });
    }
    if (need.status !== 'in_hq') {
      run(`UPDATE needs SET status = 'in_hq', hq_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, id);
    }
    sendToSystem('hq', 'need', id, { action: 'verify_and_process', positions: positions.map((p) => p.id), tribeId: need.tribe_id });
  });
}

/** Передать в штаб все позиции, по которым маршрут ещё не запущен. */
export function sendToHq(id: number, user: SessionUser) {
  const need = needForUser(id, user);
  const ids = (need.positions as Position[]).filter((p) => p.route_status === 'not_started' && p.option_case).map((p) => p.id);
  if (!ids.length) throw new HttpError(409, 'Нет позиций с выбранным способом обеспечения для передачи в штаб');
  launchRoute(id, user, ids);
}

/** Перенос выбранных позиций в новую копию потребности (split). */
export function splitNeed(id: number, user: SessionUser, ids: number[]) {
  const need = needForUser(id, user);
  const positions = selected(need, ids);
  if (positions.length === need.positions.length) throw new HttpError(409, 'Для разделения оставьте в исходной потребности хотя бы одну позицию');
  if (positions.some((p) => !EDITABLE_ROUTE.includes(p.route_status))) throw new HttpError(409, 'Нельзя переносить позиции, запущенные на маршрут');
  return tx(() => {
    const { id: newId } = run(
      `INSERT INTO needs (status, initiator_id, tribe_id, product, backlog_key, backlog_url, requirements_summary, scenario, parent_need_id, source, submitted_at)
       VALUES ('matching', ?, ?, ?, ?, ?, ?, ?, ?, 'split', datetime('now'))`,
      need.initiator_id, need.tribe_id, need.product, need.backlog_key, need.backlog_url, need.requirements_summary, need.scenario, id,
    );
    for (const p of positions) run('UPDATE need_positions SET need_id = ? WHERE id = ?', newId, p.id);
    return newId;
  });
}

function refreshNeedStatus(needId: number) {
  const rows = all<{ route_status: string }>('SELECT route_status FROM need_positions WHERE need_id = ?', needId);
  if (rows.length && rows.every((r) => r.route_status === 'approved')) {
    run(`UPDATE needs SET status = 'completed', updated_at = datetime('now') WHERE id = ?`, needId);
  }
}

/**
 * Ответ внешней системы по активному шагу маршрута. В MVP вызывается из эмулятора на карточке потребности
 * или внешним callback'ом (POST /api/integrations/callback).
 */
export function advancePosition(positionId: number, outcome: 'success' | 'fail', source = 'emulator') {
  const p = get<any>('SELECT * FROM need_positions WHERE id = ?', positionId);
  if (!p) throw new HttpError(404, 'Позиция не найдена');
  const steps = json.parse<RouteStep[]>(p.route_steps, []);
  if (!steps.length) throw new HttpError(409, 'Маршрут по позиции не запущен');
  let result;
  try {
    result = advanceRoute(steps, outcome);
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
  tx(() => {
    run('UPDATE need_positions SET route_steps = ?, route_status = ? WHERE id = ?', json.str(result.steps), result.status, positionId);
    const done = steps.find((s) => s.status === 'active')!;
    run('INSERT INTO integration_events (system, direction, entity, entity_id, payload) VALUES (?, ?, ?, ?, ?)',
      done.system, 'in', 'position', positionId, json.str({ step: done.step, outcome, source }));
    if (result.activated) {
      sendToSystem(result.activated.system, 'position', positionId, { step: result.activated.step, title: STEP_INFO[result.activated.step].title });
    }
    refreshNeedStatus(p.need_id);
  });
  return result.status;
}

/** Эмулятор ответа внешней системы — доступен инициатору потребности. */
export function advanceAsUser(positionId: number, user: SessionUser, outcome: 'success' | 'fail') {
  positionOf(positionId, user);
  return advancePosition(positionId, outcome, 'emulator');
}

export function listNeeds(user: SessionUser, q: { search?: string; status?: string; product?: string; from?: string; to?: string }) {
  const where = ['n.initiator_id = ?'];
  const params: any[] = [user.id];
  if (q.status) { where.push('n.status = ?'); params.push(q.status); }
  if (q.product) { where.push('ulower(n.product) LIKE ?'); params.push(likeParam(q.product)); }
  if (q.search) {
    const like = likeParam(q.search);
    where.push(`(CAST(n.id AS TEXT) = ? OR ulower(n.product) LIKE ? OR ulower(n.requirements_summary) LIKE ? OR ulower(n.backlog_key) LIKE ?
      OR EXISTS (SELECT 1 FROM need_positions p WHERE p.need_id = n.id AND ulower(p.role) LIKE ?))`);
    params.push(q.search.replace(/^#/, ''), like, like, like, like);
  }
  const rows = all<any>(
    `SELECT n.id, n.status, n.product, n.created_at, n.backlog_key, n.source, u.full_name AS initiator_name,
            (SELECT MIN(start_date) FROM need_positions p WHERE p.need_id = n.id) AS start_date
       FROM needs n JOIN users u ON u.id = n.initiator_id
      WHERE ${where.join(' AND ')} ORDER BY n.id DESC`, ...params,
  );
  const filtered = rows.filter((r) => (!q.from || (r.start_date && r.start_date >= q.from)) && (!q.to || (r.start_date && r.start_date <= q.to)));
  const ids = filtered.map((r) => r.id);
  const positions = ids.length
    ? all<any>(`SELECT need_id, role, quantity, route_status FROM need_positions WHERE need_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`, ...ids)
    : [];
  return filtered.map((r) => {
    const own = positions.filter((p) => p.need_id === r.id);
    const groups = new Map<string, { role: string; count: number; statuses: Record<string, number> }>();
    for (const p of own) {
      const g = groups.get(p.role) ?? { role: p.role, count: 0, statuses: {} as Record<string, number> };
      g.count += p.quantity;
      const s = ROUTE_STATUSES[p.route_status as RouteStatus];
      g.statuses[s] = (g.statuses[s] ?? 0) + p.quantity;
      groups.set(p.role, g);
    }
    return { ...r, positions: [...groups.values()] };
  });
}
