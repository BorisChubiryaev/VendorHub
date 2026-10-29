import { config } from '../../config.js';
import { sendToSystem } from '../integrations.js';
import { jiraProvider } from './jira.js';
import { mockProvider } from './mock.js';
export { parseKey } from './key.js';

export interface BacklogItem {
  key: string;
  url: string;
  summary: string;
  description?: string | null;
}

export interface BacklogProvider {
  /** Найти объект бэклога по ключу (VH-12) или ссылке. */
  find(keyOrUrl: string): Promise<BacklogItem | null>;
  /** Поиск похожих объектов по тексту — чтобы не создавать дубль. */
  search(text: string): Promise<BacklogItem[]>;
  create(input: { summary: string; description: string; userId: number }): Promise<BacklogItem>;
}

export function backlog(): BacklogProvider {
  return config.backlog.provider === 'jira' ? jiraProvider : mockProvider;
}

/** Создать элемент бэклога из текстовых требований, если похожего ещё нет. */
export async function ensureBacklogItem(input: { summary: string; description: string; userId: number; needId?: number }) {
  const provider = backlog();
  const similar = await provider.search(input.summary);
  const exact = similar.find((i) => i.summary.trim().toLowerCase() === input.summary.trim().toLowerCase());
  if (exact) return { item: exact, created: false, similar };
  const item = await provider.create(input);
  if (input.needId) sendToSystem('jira', 'need', input.needId, { action: 'create_issue', key: item.key });
  return { item, created: true, similar };
}
