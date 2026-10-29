import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extract, parseDates, parsePositions } from '../src/services/assistant/nlu.js';

const today = '2026-10-29';

describe('разбор дат', () => {
  it('диапазон словами без года — ближайшее будущее', () => {
    assert.deepEqual(parseDates('с 1 декабря по 31 мая', today), { start: '2026-12-01', end: '2027-05-31' });
  });
  it('числовые даты', () => {
    assert.deepEqual(parseDates('с 01.02.2027 до 30.06.2027', today), { start: '2027-02-01', end: '2027-06-30' });
  });
  it('длительность', () => {
    assert.deepEqual(parseDates('с января на 6 месяцев', today), { start: '2027-01-01', end: '2027-06-30' });
    assert.deepEqual(parseDates('с 1 декабря на полгода', today), { start: '2026-12-01', end: '2027-05-31' });
  });
});

describe('разбор позиций', () => {
  it('количество, уровень и навыки не «перетекают» между позициями', () => {
    const p = parsePositions('Два сеньор бэкендера на Java и Kafka, одного тестировщика middle и аналитика', today);
    assert.deepEqual(p.map((x) => [x.role, x.quantity, x.level, x.skills]), [
      ['Backend-разработчик', 2, 'Senior', ['Java', 'Kafka']],
      ['QA-инженер', 1, 'Middle', []],
      ['Системный аналитик', 1, null, []],
    ]);
  });
  it('количество после роли и собственные даты позиции', () => {
    const [front, devops] = parsePositions('фронтенд на React x3 с 01.02.2027 до 31.07.2027; devops на кубер с января на 3 месяца', today);
    assert.equal(front.quantity, 3);
    assert.equal(front.start_date, '2027-02-01');
    assert.deepEqual(devops.skills, ['Kubernetes']);
    assert.equal(devops.end_date, '2027-03-31');
  });
});

describe('извлечение потребности', () => {
  it('продукт, требования и ссылка на задачу', () => {
    const x = extract('Для продукта «Мобильный банк» нужно реализовать онлайн-оформление вкладов, задача VH-12', ['Мобильный банк'], today);
    assert.equal(x.product, 'Мобильный банк');
    assert.match(x.requirements!, /онлайн-оформление вкладов/);
    assert.equal(x.backlogRef, 'VH-12');
  });
});
