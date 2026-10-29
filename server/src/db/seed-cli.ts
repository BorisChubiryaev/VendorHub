import fs from 'node:fs';
import { config } from '../config.js';
import { seed } from './seed.js';

// Пересоздаёт базу с демо-данными
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
seed();
console.log(`База пересоздана: ${config.dbPath}`);
