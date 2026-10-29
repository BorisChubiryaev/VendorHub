// Точка входа Vercel: весь REST API — одна serverless-функция на Express.
// Фронтенд (web/dist) раздаётся CDN Vercel, см. vercel.json.
const { config } = await import('../server/dist/config.js');
const { seedIfEmpty } = await import('../server/dist/db/seed.js');
const { createApp } = await import('../server/dist/app.js');

// SQLite живёт в /tmp экземпляра функции: при холодном старте база создаётся заново с демо-данными
if (config.seedDemoData && seedIfEmpty()) console.log(`ВендорХаб: демо-данные загружены в ${config.dbPath}`);

const app = createApp();

export default function handler(req, res) {
  return app(req, res);
}
