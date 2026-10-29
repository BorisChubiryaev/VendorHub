import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from '../config.js';
import { schemaSql } from './schema.js';

export type Row = Record<string, any>;

let instance: DatabaseSync | null = null;

export function openDb(file = config.dbPath): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(schemaSql);
  // LIKE в SQLite регистронезависим только для ASCII — для кириллицы используем ulower()
  db.function('ulower', { deterministic: true }, (v) => (v == null ? null : String(v).toLowerCase().replace(/ё/g, 'е')));
  return db;
}

export function db(): DatabaseSync {
  if (!instance) instance = openDb();
  return instance;
}

/** Для тестов: подменить подключение (например, на in-memory). */
export function setDb(next: DatabaseSync) {
  instance = next;
}

/** Шаблон для регистронезависимого поиска: ulower(col) LIKE likeParam(text). */
export const likeParam = (text: string) => `%${text.toLowerCase().replace(/ё/g, 'е')}%`;

export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SQLInputValue[]) {
  const r = db().prepare(sql).run(...params);
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export const json = {
  parse<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string' || !value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },
  str: (value: unknown) => JSON.stringify(value ?? null),
};
