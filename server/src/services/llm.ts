import { config } from '../config.js';

export const llmEnabled = () => !!config.llm.apiUrl;

/**
 * Вызов OpenAI-совместимого chat/completions (например, через шлюз к GigaChat).
 * Возвращает распарсенный JSON из ответа модели или null при любой ошибке — вызывающий код откатывается на rule-based разбор.
 */
export async function llmJson<T>(system: string, user: string): Promise<T | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await fetch(config.llm.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}) },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as T) : null;
  } catch {
    return null;
  }
}
