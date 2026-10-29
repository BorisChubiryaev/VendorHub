import { config } from '../config.js';
import { all, json } from '../db/index.js';
import { LEVELS, sameRole, sameSkill } from '../lib/dictionaries.js';

/**
 * Варианты обеспечения позиции (см. схему «Варианты обеспечения позиций фактической потребности»):
 *  1 — кандидат в бассейне + лимит трайба заказчика      → рекомендация кандидата
 *  2 — кандидат в бассейне + лимит другого трайба        → «иди в закупки»
 *  3 — кандидат в бассейне + лимит в резерве блока Т     → «иди в закупки»
 *  4 — запрос кандидатов у вендора + лимит трайба        → «иди к вендору»
 *  5 — запрос у вендора + лимит другого трайба           → «иди в закупки»
 *  6 — запрос у вендора + лимит в резерве                → «иди в закупки»
 *  7 — новый договор                                     → «иди в закупки»
 */
export type OptionCase = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type LimitOwner = 'own' | 'other' | 'reserve';

export const CASE_INFO: Record<OptionCase, { title: string; action: 'recommend' | 'procurement' | 'vendor'; banner: string; scenario: string }> = {
  1: { title: 'Кандидат из бассейна, лимит вашего трайба', action: 'recommend', banner: 'Рекомендуем кандидата — договор и лимит есть', scenario: 'А' },
  2: { title: 'Кандидат из бассейна, лимит другого трайба', action: 'procurement', banner: 'Иди в закупки: нужна передача лимита от другого трайба', scenario: 'Б' },
  3: { title: 'Кандидат из бассейна, лимит в резерве блока Т', action: 'procurement', banner: 'Иди в закупки: нужно выделение лимита из резерва', scenario: 'В' },
  4: { title: 'Запрос кандидатов у вендора, лимит вашего трайба', action: 'vendor', banner: 'Иди к вендору: запроси кандидатов по действующему договору', scenario: 'Д' },
  5: { title: 'Запрос кандидатов у вендора, лимит другого трайба', action: 'procurement', banner: 'Иди в закупки: договор есть, лимит у другого трайба', scenario: 'Е' },
  6: { title: 'Запрос кандидатов у вендора, лимит в резерве', action: 'procurement', banner: 'Иди в закупки: договор есть, лимит в резерве блока Т', scenario: 'Ж' },
  7: { title: 'Новый договор', action: 'procurement', banner: 'Иди в закупки: подходящего договора с лимитом нет — нужен новый договор', scenario: 'Г' },
};

export interface PositionInput {
  id?: number;
  role: string;
  level?: string | null;
  skills: string[];
  start_date?: string | null;
  end_date?: string | null;
}

export interface CandidateRow {
  id: number;
  full_name: string;
  role: string | null;
  level: string | null;
  skills: string[];
  rating: number | null;
  available_from: string | null;
  available_to: string | null;
  rate: number | null;
  city: string | null;
  vendor_id: number | null;
  vendor_name?: string | null;
  uvb_status: string;
  total_experience: number | null;
}

interface ContractRow {
  id: number;
  number: string;
  vendor_id: number;
  vendor_name: string;
  roles: { role: string; rate: number }[];
  start_date: string;
  end_date: string;
}

interface LimitRow {
  id: number;
  contract_id: number;
  owner_type: 'tribe' | 'reserve';
  tribe_id: number | null;
  tribe_name: string | null;
  remaining: number;
  start_date: string;
  end_date: string;
}

export interface Relevance {
  score: number; // 0..100
  role: boolean;
  level: 'exact' | 'near' | 'other' | 'any';
  skillsMatched: string[];
  skillsMissing: string[];
  availability: 'full' | 'partial' | 'none' | 'unknown';
  coverage: number; // 0..1
}

export interface SupplyOption {
  key: string; // уникальный ключ варианта: c:<candidateId> | v:<contractId> | new
  case: OptionCase;
  kind: 'candidate' | 'vendor_request' | 'new_contract';
  title: string;
  action: 'recommend' | 'procurement' | 'vendor';
  banner: string;
  scenario: string;
  candidate?: CandidateRow;
  contract?: { id: number; number: string; vendorId: number; vendorName: string; start: string; end: string };
  limit?: { id: number; owner: LimitOwner; tribeName: string | null; remaining: number };
  relevance: Relevance | null;
  rate: number | null;
  estimatedCost: number | null;
  startDate: string | null; // когда реально можно начать
  leadTimeDays: number; // оценка срока вывода
}

export interface Ctx {
  tribeId: number | null;
  contracts: ContractRow[];
  limits: LimitRow[];
  candidates: CandidateRow[];
  today: string;
}

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(d + 'T00:00:00Z');
const addDays = (d: string, days: number) => new Date(toTime(d) + days * DAY).toISOString().slice(0, 10);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function loadContext(tribeId: number | null, opts: { candidateStatus?: string } = {}): Ctx {
  const contracts = all<any>(
    `SELECT c.*, v.name AS vendor_name FROM contracts c JOIN vendors v ON v.id = c.vendor_id`,
  ).map((c) => ({ ...c, roles: json.parse(c.roles, []) }));
  const limits = all<LimitRow>(
    `SELECT l.*, t.name AS tribe_name FROM limits l LEFT JOIN tribes t ON t.id = l.tribe_id`,
  );
  const candidates = all<any>(
    `SELECT c.*, v.name AS vendor_name FROM candidates c LEFT JOIN vendors v ON v.id = c.vendor_id WHERE c.status = ?`,
    opts.candidateStatus ?? 'active',
  ).map(mapCandidate);
  return { tribeId, contracts, limits, candidates, today: todayIso() };
}

export function mapCandidate(c: any): CandidateRow & Record<string, any> {
  return { ...c, skills: json.parse(c.skills, []) };
}

/** Интервал позиции; если даты не заданы — с сегодняшнего дня на полгода. */
function positionInterval(p: PositionInput, today: string) {
  const start = p.start_date || today;
  const end = p.end_date && p.end_date >= start ? p.end_date : addDays(start, 182);
  return { start, end };
}

function levelMatch(required: string | null | undefined, actual: string | null): Relevance['level'] {
  if (!required) return 'any';
  if (!actual) return 'other';
  if (required.toLowerCase() === actual.toLowerCase()) return 'exact';
  const a = LEVELS.indexOf(required as any);
  const b = LEVELS.indexOf(actual as any);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1 ? 'near' : 'other';
}

export function relevance(p: PositionInput, c: CandidateRow, today = todayIso()): Relevance {
  const { start, end } = positionInterval(p, today);
  const role = sameRole(p.role, c.role);
  const level = levelMatch(p.level, c.level);
  const skillsMatched = p.skills.filter((s) => c.skills.some((cs) => sameSkill(s, cs)));
  const skillsMissing = p.skills.filter((s) => !skillsMatched.includes(s));

  let coverage = 1;
  let availability: Relevance['availability'] = 'unknown';
  if (c.available_from || c.available_to) {
    const from = c.available_from ?? '0000-01-01';
    const to = c.available_to ?? '9999-12-31';
    const overlap = Math.max(0, Math.min(toTime(end), toTime(to)) - Math.max(toTime(start), toTime(from)));
    const span = Math.max(DAY, toTime(end) - toTime(start));
    coverage = Math.min(1, overlap / span);
    availability = coverage >= 0.999 ? 'full' : coverage > 0 ? 'partial' : 'none';
  }

  const skillScore = p.skills.length ? skillsMatched.length / p.skills.length : 1;
  const levelScore = { exact: 1, any: 1, near: 0.5, other: 0 }[level];
  const ratingScore = c.rating ? Math.min(1, Math.max(0, (c.rating - 3) / 2)) : 0.5;
  const score = (role ? 30 : 0) + 30 * skillScore + 20 * levelScore + 15 * coverage + 5 * ratingScore;
  return { score: Math.round(score), role, level, skillsMatched, skillsMissing, availability, coverage };
}

function contractCovers(c: ContractRow, role: string, start: string, end: string) {
  return c.start_date <= start && c.end_date >= end && c.roles.some((r) => sameRole(r.role, role));
}

/** Лучший лимит по договору, покрывающий интервал: свой трайб → другой трайб → резерв. */
function pickLimit(ctx: Ctx, contractId: number, start: string, end: string) {
  const covering = ctx.limits.filter(
    (l) => l.contract_id === contractId && l.start_date <= start && l.end_date >= end && l.remaining > 0,
  );
  const own = covering.find((l) => l.owner_type === 'tribe' && l.tribe_id === ctx.tribeId);
  if (own) return { limit: own, owner: 'own' as const };
  const other = covering.find((l) => l.owner_type === 'tribe');
  if (other) return { limit: other, owner: 'other' as const };
  const reserve = covering.find((l) => l.owner_type === 'reserve');
  if (reserve) return { limit: reserve, owner: 'reserve' as const };
  return null;
}

const workdays = (start: string, end: string) => Math.max(1, Math.round(((toTime(end) - toTime(start)) / DAY) * (5 / 7)));
// Ориентировочные сроки процедур (дни) — для сценария «быстрый вывод»
// (для запроса у вендора — с учётом поиска кандидата вендором)
const PROCEDURE_DAYS: Record<OptionCase, number> = { 1: 7, 2: 25, 3: 20, 4: 35, 5: 55, 6: 50, 7: 120 };

/** Реальная дата выхода: не раньше начала позиции, доступности кандидата и окончания процедур. */
function realStart(ctx: Ctx, kase: OptionCase, positionStart: string, availableFrom?: string | null) {
  const dates = [positionStart, addDays(ctx.today, PROCEDURE_DAYS[kase])];
  if (availableFrom) dates.push(availableFrom);
  const startDate = dates.sort().at(-1)!;
  return { startDate, leadTimeDays: Math.round((toTime(startDate) - toTime(ctx.today)) / DAY) };
}

function cost(rate: number | null, start: string, end: string) {
  if (rate == null) return null;
  return Math.round(rate * workdays(start, end) * (config.hoursPerMonth / 21));
}

function contractInfo(c: ContractRow) {
  return { id: c.id, number: c.number, vendorId: c.vendor_id, vendorName: c.vendor_name, start: c.start_date, end: c.end_date };
}

/** Вариант обеспечения позиции конкретным кандидатом (или null, если привлечь его по схеме нельзя). */
export function candidateOption(ctx: Ctx, p: PositionInput, c: CandidateRow, opts: { requireRole?: boolean } = {}): SupplyOption | null {
  const { start, end } = positionInterval(p, ctx.today);
  const rel = relevance(p, c, ctx.today);
  if (opts.requireRole !== false && !rel.role) return null;
  if (rel.availability === 'none') return null;
  for (const contract of ctx.contracts) {
    if (contract.vendor_id !== c.vendor_id || !contractCovers(contract, p.role, start, end)) continue;
    const picked = pickLimit(ctx, contract.id, start, end);
    if (!picked) continue;
    const kase: OptionCase = picked.owner === 'own' ? 1 : picked.owner === 'other' ? 2 : 3;
    const info = CASE_INFO[kase];
    const rate = c.rate ?? contract.roles.find((r) => sameRole(r.role, p.role))?.rate ?? null;
    return {
      key: `c:${c.id}`, case: kase, kind: 'candidate', ...info,
      candidate: c, contract: contractInfo(contract),
      limit: { id: picked.limit.id, owner: picked.owner, tribeName: picked.limit.tribe_name, remaining: picked.limit.remaining },
      relevance: rel, rate, estimatedCost: cost(rate, start, end), ...realStart(ctx, kase, start, c.available_from),
    };
  }
  return null;
}

/** Все варианты обеспечения позиции, отсортированные по релевантности. */
export function findOptions(ctx: Ctx, p: PositionInput): SupplyOption[] {
  const { start, end } = positionInterval(p, ctx.today);
  const candidateOptions = ctx.candidates
    .map((c) => candidateOption(ctx, p, c))
    .filter((o): o is SupplyOption => !!o)
    .sort((a, b) => b.relevance!.score - a.relevance!.score || a.case - b.case);

  const vendorOptions: SupplyOption[] = [];
  for (const contract of ctx.contracts) {
    if (!contractCovers(contract, p.role, start, end)) continue;
    const picked = pickLimit(ctx, contract.id, start, end);
    if (!picked) continue;
    const kase: OptionCase = picked.owner === 'own' ? 4 : picked.owner === 'other' ? 5 : 6;
    const rate = contract.roles.find((r) => sameRole(r.role, p.role))?.rate ?? null;
    vendorOptions.push({
      key: `v:${contract.id}`, case: kase, kind: 'vendor_request', ...CASE_INFO[kase],
      contract: contractInfo(contract),
      limit: { id: picked.limit.id, owner: picked.owner, tribeName: picked.limit.tribe_name, remaining: picked.limit.remaining },
      relevance: null, rate, estimatedCost: cost(rate, start, end), ...realStart(ctx, kase, start),
    });
  }
  vendorOptions.sort((a, b) => a.case - b.case || (a.rate ?? Infinity) - (b.rate ?? Infinity));

  const options = [...candidateOptions, ...vendorOptions];
  if (!vendorOptions.length) {
    options.push({
      key: 'new', case: 7, kind: 'new_contract', ...CASE_INFO[7], relevance: null, rate: null, estimatedCost: null,
      ...realStart(ctx, 7, start),
    });
  }
  return options;
}

export type ScenarioKey = 'best' | 'fast' | 'cheap';
export const SCENARIOS: Record<ScenarioKey | 'custom', string> = {
  best: 'Лучшее совпадение',
  fast: 'Быстрый вывод',
  cheap: 'Наименьший бюджет',
  custom: 'Свой сценарий',
};

/** Чем меньше — тем лучше. */
function scenarioCost(s: ScenarioKey, o: SupplyOption): number {
  const isCandidate = o.kind === 'candidate';
  switch (s) {
    case 'best':
      // Кандидаты из бассейна приоритетнее запросов к вендору, внутри — по релевантности, затем по сложности схемы
      return (isCandidate ? 0 : 1000) - (o.relevance?.score ?? 0) + o.case * 2;
    case 'fast':
      return o.leadTimeDays * 10 - (o.relevance?.score ?? 0) / 10;
    case 'cheap':
      return (o.estimatedCost ?? 1e12) + (isCandidate ? 0 : 1) - (o.relevance?.score ?? 0);
  }
}

/**
 * Комплексный сценарий обеспечения всех позиций: для каждой позиции выбирается лучший по критерию сценария вариант,
 * один кандидат не назначается на две позиции.
 */
export function buildScenario(s: ScenarioKey, positions: { id: number; options: SupplyOption[] }[]) {
  const used = new Set<number>();
  const result: Record<number, SupplyOption> = {};
  // Сначала позиции с наименьшим числом кандидатов — чтобы дефицитные роли не остались без людей
  const order = [...positions].sort(
    (a, b) => a.options.filter((o) => o.candidate).length - b.options.filter((o) => o.candidate).length,
  );
  for (const p of order) {
    const sorted = [...p.options].sort((a, b) => scenarioCost(s, a) - scenarioCost(s, b));
    const chosen = sorted.find((o) => !o.candidate || !used.has(o.candidate.id)) ?? sorted[sorted.length - 1];
    if (chosen?.candidate) used.add(chosen.candidate.id);
    if (chosen) result[p.id] = chosen;
  }
  return result;
}
