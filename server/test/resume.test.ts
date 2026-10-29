import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseResume, pdfToText } from '../src/services/resumeParser.js';

const fixture = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f));

describe('распознавание резюме PDF', () => {
  it('резюме в свободном формате', async () => {
    const r = await parseResume(await pdfToText(fixture('resume-backend.pdf')));
    assert.equal(r.full_name, 'Соколов Дмитрий Игоревич');
    assert.equal(r.city, 'Москва');
    assert.equal(r.role, 'Backend-разработчик');
    assert.equal(r.level, 'Senior');
    assert.equal(r.total_experience, 9.3);
    assert.equal(r.rate, 4200);
    assert.ok(r.skills.includes('Java') && r.skills.includes('Kafka'));
    assert.match(r.sber_experience ?? '', /Сбербанк/);
    assert.deepEqual(r.missing, []);
  });

  it('резюме с полями «ключ: значение»', async () => {
    const r = await parseResume(await pdfToText(fixture('resume-qa.pdf')));
    assert.equal(r.full_name, 'Морозова Ксения Олеговна');
    assert.equal(r.city, 'Санкт-Петербург');
    assert.equal(r.role, 'QA-инженер');
    assert.equal(r.level, 'Middle');
    assert.ok(r.age! >= 29 && r.age! <= 31);
    assert.deepEqual(r.missing, ['rate']);
  });

  it('не-PDF — понятная ошибка', async () => {
    await assert.rejects(pdfToText(fixture('not-a-pdf.pdf')), /не является PDF/);
  });
});
