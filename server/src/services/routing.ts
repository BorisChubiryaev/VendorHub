import type { OptionCase } from './matching.js';
import { CASE_INFO } from './matching.js';
import type { ExternalSystem } from './integrations.js';

export type StepKey = 'confirm' | 'interview' | 'limit_transfer' | 'znr' | 'new_contract';
export type StepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface RouteStep {
  step: StepKey;
  status: StepStatus;
  system: ExternalSystem;
}

export const STEP_INFO: Record<StepKey, { title: string; system: ExternalSystem; activeStatus: RouteStatus; failStatus?: RouteStatus }> = {
  confirm: { title: 'Запрос подтверждения готовности у кандидата', system: 'sberchat', activeStatus: 'candidate_confirmation', failStatus: 'candidate_declined' },
  interview: { title: 'Организация собеседования', system: 'pulse_hiring', activeStatus: 'interviewing', failStatus: 'interview_failed' },
  limit_transfer: { title: 'Заявка на передачу лимита', system: 'limits', activeStatus: 'limit_transfer' },
  znr: { title: 'Заявка на ресурс (ЗНР / ЗНРД)', system: 'lk', activeStatus: 'request_approval' },
  new_contract: { title: 'Заключение нового договора', system: 'procurement', activeStatus: 'contract_conclusion' },
};

export type RouteStatus =
  | 'not_started' | 'candidate_confirmation' | 'candidate_declined' | 'interviewing' | 'interview_failed'
  | 'limit_transfer' | 'request_approval' | 'contract_conclusion' | 'approved';

export const ROUTE_STATUSES: Record<RouteStatus, string> = {
  not_started: 'Маршрут не запущен',
  candidate_confirmation: 'Подтверждение кандидатом',
  candidate_declined: 'Кандидат отказался',
  interviewing: 'Проведение собеседований',
  interview_failed: 'Собеседование не пройдено',
  limit_transfer: 'Проведение передачи лимита',
  request_approval: 'Согласование заявки',
  contract_conclusion: 'Заключение договора',
  approved: 'Заявка согласована',
};

export const TERMINAL_FAIL: RouteStatus[] = ['candidate_declined', 'interview_failed'];

/** Шаги сценариев А–Ж из таблицы «Сценарии дальнейших действий». Собеседование — если установлен признак. */
const SCENARIO_STEPS: Record<string, StepKey[]> = {
  А: ['confirm', 'interview', 'znr'],
  Б: ['confirm', 'interview', 'limit_transfer', 'znr'],
  В: ['confirm', 'interview', 'limit_transfer', 'znr'],
  Г: ['new_contract'],
  Д: ['znr', 'interview'],
  Е: ['limit_transfer', 'znr', 'interview'],
  Ж: ['limit_transfer', 'znr', 'interview'],
};

export function buildRoute(optionCase: OptionCase, interviewRequired: boolean): { scenario: string; steps: RouteStep[] } {
  const scenario = CASE_INFO[optionCase].scenario;
  const steps = SCENARIO_STEPS[scenario]
    .filter((s) => s !== 'interview' || interviewRequired)
    .map((step, i) => ({ step, status: (i === 0 ? 'active' : 'pending') as StepStatus, system: STEP_INFO[step].system }));
  return { scenario, steps };
}

/** Применить ответ внешней системы к активному шагу. Возвращает новый статус маршрута. */
export function advanceRoute(steps: RouteStep[], outcome: 'success' | 'fail'): { steps: RouteStep[]; status: RouteStatus; activated: RouteStep | null } {
  const next = steps.map((s) => ({ ...s }));
  const idx = next.findIndex((s) => s.status === 'active');
  if (idx < 0) throw new Error('Нет активного шага маршрута');
  const current = next[idx];
  const info = STEP_INFO[current.step];
  if (outcome === 'fail') {
    if (!info.failStatus) throw new Error('Для этого шага отрицательный исход не предусмотрен');
    current.status = 'failed';
    return { steps: next, status: info.failStatus, activated: null };
  }
  current.status = 'done';
  const following = next[idx + 1];
  if (!following) return { steps: next, status: 'approved', activated: null };
  following.status = 'active';
  return { steps: next, status: STEP_INFO[following.step].activeStatus, activated: following };
}

export function initialStatus(steps: RouteStep[]): RouteStatus {
  return STEP_INFO[steps[0].step].activeStatus;
}
