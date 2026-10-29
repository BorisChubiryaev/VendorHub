import { config } from '../../config.js';
import type { BacklogItem, BacklogProvider } from './index.js';
import { parseKey } from './key.js';

/** Jira / СберТрек (Jira-совместимый REST API v2). Включается BACKLOG_PROVIDER=jira. */
async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(new URL(path, config.backlog.jiraUrl), {
    ...init,
    headers: { Authorization: `Bearer ${config.backlog.jiraToken}`, 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Jira ответила ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json() as Promise<any>;
}

const toItem = (issue: any): BacklogItem => ({
  key: issue.key,
  url: new URL(`/browse/${issue.key}`, config.backlog.jiraUrl).toString(),
  summary: issue.fields?.summary ?? '',
  description: issue.fields?.description ?? null,
});

export const jiraProvider: BacklogProvider = {
  async find(keyOrUrl) {
    const key = parseKey(keyOrUrl);
    if (!key) return null;
    try {
      return toItem(await call(`/rest/api/2/issue/${key}?fields=summary,description`));
    } catch {
      return null;
    }
  },
  async search(text) {
    const q = text.replace(/["\\]/g, ' ').slice(0, 100);
    const jql = `project = "${config.backlog.jiraProject}" AND summary ~ "${q}" ORDER BY created DESC`;
    const r = await call(`/rest/api/2/search?maxResults=5&fields=summary,description&jql=${encodeURIComponent(jql)}`);
    return (r.issues ?? []).map(toItem);
  },
  async create({ summary, description }) {
    const r = await call('/rest/api/2/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields: { project: { key: config.backlog.jiraProject }, summary, description, issuetype: { name: config.backlog.jiraIssueType } },
      }),
    });
    return { key: r.key, url: new URL(`/browse/${r.key}`, config.backlog.jiraUrl).toString(), summary, description };
  },
};
