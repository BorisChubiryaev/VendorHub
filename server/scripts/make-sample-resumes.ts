/**
 * Генерация примеров резюме в PDF для демонстрации импорта и тестов.
 * Запуск: npx tsx scripts/make-sample-resumes.ts [шрифт.ttf]
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const font = process.argv[2] ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const out = path.resolve(import.meta.dirname, '..', 'test', 'fixtures');

const resumes: Record<string, string[]> = {
  'resume-backend.pdf': [
    'Соколов Дмитрий Игоревич',
    'Мужчина, 34 года, родился 12 марта 1992',
    'Проживает: Москва',
    'Желаемая должность: Ведущий Java-разработчик (Senior)',
    'Ставка: 4200 руб/час',
    '',
    'Опыт работы — 9 лет 4 месяца',
    'Сентябрь 2021 — по настоящее время. ПАО Сбербанк (через ООО «Альфа Софт»), проект «Кредитный конвейер».',
    'Разработка микросервисов на Java 17, Spring Boot, Kafka, PostgreSQL. Миграция в OpenShift.',
    'Март 2017 — август 2021. ООО «Финтех Решения». Backend-разработчик: REST API, Oracle, Docker.',
    '',
    'Ключевые навыки',
    'Java, Spring, Kafka, PostgreSQL, Oracle, Docker, Kubernetes, REST, Микросервисы, Git',
    '',
    'Образование',
    'МГТУ им. Н.Э. Баумана, 2015',
  ],
  'resume-qa.pdf': [
    'Резюме',
    'ФИО: Морозова Ксения Олеговна',
    'Дата рождения: 05.07.1996',
    'Город: Санкт-Петербург',
    'Должность: QA-инженер (автоматизация), Middle',
    '',
    'Общий опыт: 4 года',
    'ООО «Тест Лаб» — автоматизация тестирования веб-приложений: Playwright, Python, pytest, Postman, SQL.',
    '',
    'Навыки: Python, Playwright, Selenium, pytest, SQL, Postman, Jira',
  ],
};

for (const [file, lines] of Object.entries(resumes)) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(fs.createWriteStream(path.join(out, file)));
  doc.font(font).fontSize(11);
  for (const line of lines) doc.text(line || ' ');
  doc.end();
}
// Не-PDF и «скан» без текста — для проверки ошибок
fs.writeFileSync(path.join(out, 'not-a-pdf.pdf'), 'Это не PDF');
console.log('Готово:', out);
