import { all, json, run } from '../db/index.js';

export type ExternalSystem = 'jira' | 'sberchat' | 'pulse' | 'pulse_hiring' | 'limits' | 'lk' | 'procurement' | 'hq';

export const SYSTEM_NAMES: Record<ExternalSystem, string> = {
  jira: 'Jira / СберТрек',
  sberchat: 'СберЧат',
  pulse: 'Пульс',
  pulse_hiring: 'Пульс.Подбор',
  limits: 'Модуль передачи лимитов',
  lk: 'Модуль ЛК (ЗНР / ЗНРД)',
  procurement: 'Модуль планирования потребностей и заключения договоров',
  hq: 'Штаб юнита / трайба',
};

/**
 * Отправка сообщения во внешнюю систему. В MVP все интеграции, кроме Jira (опционально) и СберЧата (входящий webhook),
 * работают в режиме заглушки: событие журналируется, ответ системы эмулируется через API /route/advance.
 */
export function sendToSystem(system: ExternalSystem, entity: string, entityId: number, payload: unknown) {
  run('INSERT INTO integration_events (system, direction, entity, entity_id, payload) VALUES (?, ?, ?, ?, ?)',
    system, 'out', entity, entityId, json.str(payload));
}

export function logInbound(system: ExternalSystem, entity: string, entityId: number | null, payload: unknown) {
  run('INSERT INTO integration_events (system, direction, entity, entity_id, payload) VALUES (?, ?, ?, ?, ?)',
    system, 'in', entity, entityId, json.str(payload));
}

export function eventsFor(entity: string, ids: number[]) {
  if (!ids.length) return [];
  return all<any>(
    `SELECT * FROM integration_events WHERE entity = ? AND entity_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC`,
    entity, ...ids,
  ).map((e) => ({ ...e, payload: json.parse(e.payload, null), systemName: SYSTEM_NAMES[e.system as ExternalSystem] ?? e.system }));
}
