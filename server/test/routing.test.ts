import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { advanceRoute, buildRoute } from '../src/services/routing.js';

describe('маршруты А–Ж', () => {
  it('шаги по таблице сценариев', () => {
    const steps = (c: 1 | 2 | 3 | 4 | 5 | 6 | 7, interview = true) => buildRoute(c, interview).steps.map((s) => s.step);
    assert.deepEqual(steps(1), ['confirm', 'interview', 'znr']);
    assert.deepEqual(steps(2), ['confirm', 'interview', 'limit_transfer', 'znr']);
    assert.deepEqual(steps(3), ['confirm', 'interview', 'limit_transfer', 'znr']);
    assert.deepEqual(steps(4), ['znr', 'interview']);
    assert.deepEqual(steps(5), ['limit_transfer', 'znr', 'interview']);
    assert.deepEqual(steps(6), ['limit_transfer', 'znr', 'interview']);
    assert.deepEqual(steps(7), ['new_contract']);
    assert.deepEqual(steps(1, false), ['confirm', 'znr']);
    assert.equal(buildRoute(7, false).scenario, 'Г');
  });

  it('прохождение и отказ', () => {
    let { steps } = buildRoute(1, true);
    let r = advanceRoute(steps, 'success');
    assert.equal(r.status, 'interviewing');
    r = advanceRoute(r.steps, 'fail');
    assert.equal(r.status, 'interview_failed');
    steps = buildRoute(4, false).steps;
    assert.equal(advanceRoute(steps, 'success').status, 'approved');
    assert.throws(() => advanceRoute(buildRoute(4, false).steps, 'fail'));
  });
});
