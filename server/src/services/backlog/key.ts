/** Ключ из ссылки вида https://jira/browse/ABC-123 или просто ABC-123. */
export function parseKey(keyOrUrl: string): string | null {
  const m = keyOrUrl.trim().match(/([A-Za-z][A-Za-z0-9_]*-\d+)\s*$/) ?? keyOrUrl.match(/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/);
  return m ? m[1].toUpperCase() : null;
}
