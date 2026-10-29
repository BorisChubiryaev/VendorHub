import { openDb, setDb, get } from '../src/db/index.js';
import { seed } from '../src/db/seed.js';
import { loadUser, publicUser } from '../src/lib/auth.js';

/** Чистая in-memory база с демо-данными. */
export function freshDb() {
  setDb(openDb(':memory:'));
  seed();
}

export function user(login: string) {
  return publicUser(loadUser('login', login)!);
}

export const tribeId = (name: string) => get<{ id: number }>('SELECT id FROM tribes WHERE name = ?', name)!.id;
