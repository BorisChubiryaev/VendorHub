import { all, get, run } from '../../db/index.js';
import type { BacklogItem, BacklogProvider } from './index.js';
import { parseKey } from './key.js';

const BASE = 'https://jira.local/browse/';

/** Встроенный бэклог для стенда без доступа к Jira/СберТреку. */
export const mockProvider: BacklogProvider = {
  async find(keyOrUrl) {
    const key = parseKey(keyOrUrl);
    if (!key) return null;
    return get<BacklogItem>('SELECT key, url, summary, description FROM backlog_items WHERE key = ?', key) ?? null;
  },
  async search(text) {
    const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3).slice(0, 6);
    if (!words.length) return [];
    const items = all<BacklogItem>('SELECT key, url, summary, description FROM backlog_items');
    return items
      .map((i) => ({ i, hits: words.filter((w) => i.summary.toLowerCase().includes(w)).length }))
      .filter((x) => x.hits >= Math.min(2, words.length))
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.i);
  },
  async create({ summary, description, userId }) {
    const next = (get<{ n: number }>('SELECT COUNT(*) AS n FROM backlog_items')?.n ?? 0) + 1;
    let key = `VH-${next}`;
    while (get('SELECT 1 FROM backlog_items WHERE key = ?', key)) key = `VH-${Number(key.slice(3)) + 1}`;
    run('INSERT INTO backlog_items (key, url, summary, description, created_by) VALUES (?, ?, ?, ?, ?)',
      key, BASE + key, summary, description, userId);
    return { key, url: BASE + key, summary, description };
  },
};
