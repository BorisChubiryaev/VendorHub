import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { buildScenario, findOptions, loadContext, relevance, type CandidateRow } from '../src/services/matching.js';
import { freshDb, tribeId } from './helpers.js';

const interval = { start_date: '2026-12-01', end_date: '2027-05-31' };

describe('варианты обеспечения позиции (схема 1–7)', () => {
  beforeEach(freshDb);

  const casesFor = (tribe: string, role: string) =>
    new Set(findOptions(loadContext(tribeId(tribe)), { role, skills: [], ...interval }).map((o) => o.case));

  it('1 — кандидат из бассейна и лимит трайба заказчика', () => {
    assert.ok(casesFor('Розничный бизнес', 'Backend-разработчик').has(1));
  });
  it('2 — кандидат из бассейна, лимит другого трайба', () => {
    assert.ok(casesFor('Розничный бизнес', 'Data Scientist').has(2));
  });
  it('3 — кандидат из бассейна, лимит в резерве', () => {
    assert.ok(casesFor('Розничный бизнес', 'Системный аналитик').has(3));
  });
  it('4 — кандидатов нет, договор и лимит трайба есть → запрос у вендора', () => {
    assert.deepEqual([...casesFor('Розничный бизнес', 'Архитектор')], [4]);
  });
  it('5 — запрос у вендора, лимит другого трайба', () => {
    // у Корпоративного бизнеса нет лимитов по договору с архитекторами
    assert.deepEqual([...casesFor('Корпоративный бизнес', 'Архитектор')], [5]);
  });
  it('6 — запрос у вендора, лимит в резерве', () => {
    assert.ok(casesFor('Розничный бизнес', 'UX/UI-дизайнер').has(6));
  });
  it('7 — договора нет → новый договор', () => {
    assert.deepEqual([...casesFor('Розничный бизнес', 'Руководитель проекта')], [7]);
  });
  it('договор, не покрывающий интервал позиции, не предлагается', () => {
    // договоры Эпсилон действуют до 30.06.2027
    const ctx = loadContext(tribeId('Розничный бизнес'));
    const opts = findOptions(ctx, { role: 'UX/UI-дизайнер', skills: [], start_date: '2027-03-01', end_date: '2027-12-31' });
    assert.deepEqual(opts.map((o) => o.case), [7]);
  });
});

describe('релевантность', () => {
  const base: CandidateRow = {
    id: 1, full_name: 'Тест', role: 'Backend-разработчик', level: 'Senior', skills: ['Java', 'Kafka'], rating: 5,
    available_from: '2026-11-01', available_to: '2027-12-31', rate: 3000, city: 'Москва', vendor_id: 1, uvb_status: 'passed', total_experience: 7,
  };
  const pos = { role: 'бэкенд', level: 'Senior', skills: ['java', 'Kafka'], ...interval };

  it('полное совпадение даёт 100', () => {
    assert.equal(relevance(pos, base).score, 100);
  });
  it('учитывает навыки, уровень и доступность', () => {
    const r = relevance(pos, { ...base, level: 'Junior', skills: ['Java'], available_from: '2027-03-01' });
    assert.equal(r.level, 'other');
    assert.deepEqual(r.skillsMissing, ['Kafka']);
    assert.equal(r.availability, 'partial');
    assert.ok(r.score < 70);
  });
});

describe('сценарии комплексного обеспечения', () => {
  beforeEach(freshDb);

  it('один кандидат не назначается на две позиции', () => {
    const ctx = loadContext(tribeId('Розничный бизнес'));
    const p = { role: 'Backend-разработчик', level: 'Senior', skills: ['Java'], ...interval };
    const positions = [1, 2, 3].map((id) => ({ id, options: findOptions(ctx, p) }));
    for (const s of ['best', 'fast', 'cheap'] as const) {
      const chosen = Object.values(buildScenario(s, positions)).map((o) => o.candidate?.id).filter(Boolean);
      assert.equal(new Set(chosen).size, chosen.length, s);
    }
  });

  it('«наименьший бюджет» не дороже «лучшего совпадения»', () => {
    const ctx = loadContext(tribeId('Розничный бизнес'));
    const positions = ['Backend-разработчик', 'QA-инженер', 'Frontend-разработчик'].map((role, id) => ({
      id, options: findOptions(ctx, { role, skills: [], ...interval }),
    }));
    const total = (s: 'best' | 'cheap') => Object.values(buildScenario(s, positions)).reduce((sum, o) => sum + (o.estimatedCost ?? 0), 0);
    assert.ok(total('cheap') <= total('best'));
  });
});
