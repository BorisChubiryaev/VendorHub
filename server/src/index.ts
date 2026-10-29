import { config } from './config.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './db/seed.js';

if (config.seedDemoData && seedIfEmpty()) console.log('База пуста — загружены демо-данные');
if (config.jwtSecret === 'vendorhub-dev-secret-change-me') console.warn('ВНИМАНИЕ: задайте JWT_SECRET для стенда');

createApp().listen(config.port, () => console.log(`ВендорХаб API: http://localhost:${config.port}`));
