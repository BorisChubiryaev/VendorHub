import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useDict } from '../auth';
import { ErrorBox } from '../components/ui';

interface Msg { from: 'user' | 'bot'; text: string; at: string; actions?: string[]; link?: { label: string; href: string } }

const SESSION_KEY = 'vh_assistant_session';

export default function AssistantPage() {
  const dict = useDict();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const start = async () => {
    const s = await api<{ sessionId: string; messages: Msg[] }>('/assistant/sessions', { method: 'POST' });
    localStorage.setItem(SESSION_KEY, s.sessionId);
    setSessionId(s.sessionId);
    setMessages(s.messages);
  };

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    (saved ? api<{ sessionId: string; messages: Msg[] }>(`/assistant/sessions/${saved}`).then((s) => { setSessionId(s.sessionId); setMessages(s.messages); }) : Promise.reject())
      .catch(() => start().catch((e) => setError(e.message)));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (value: string) => {
    if (!value.trim() || !sessionId) return;
    setBusy(true);
    setError(null);
    setText('');
    setMessages((m) => [...m, { from: 'user', text: value, at: new Date().toISOString() }]);
    try {
      const r = await api<{ replies: Msg[] }>(`/assistant/sessions/${sessionId}/messages`, { method: 'POST', json: { text: value } });
      setMessages((m) => [...m, ...r.replies]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };
  const last = messages[messages.length - 1];

  return (
    <div className="page chat-page">
      <div className="page-header">
        <div>
          <h1>Ассистент регистрации потребности</h1>
          <div className="muted small">Опишите потребность в свободной форме — ассистент уточнит недостающее и зарегистрирует карточку. {dict.features.llm ? 'Подключена языковая модель.' : 'Режим разбора по правилам.'} Тот же диалог доступен в СберЧате.</div>
        </div>
        <button className="btn" onClick={() => start().catch((e) => setError(e.message))}>Новый диалог</button>
      </div>
      <ErrorBox error={error} />
      <div className="card chat">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.from}`}>
              <div className="msg-bubble">
                <div className="pre">{m.text}</div>
                {m.link && <Link className="btn btn-sm btn-primary msg-link" to={m.link.href}>Открыть: {m.link.label}</Link>}
              </div>
            </div>
          ))}
          {busy && <div className="msg msg-bot"><div className="msg-bubble typing">…</div></div>}
          <div ref={bottom} />
        </div>
        {last?.from === 'bot' && last.actions && !busy && (
          <div className="quick-replies">{last.actions.map((a) => <button key={a} className="btn btn-sm" onClick={() => send(a)}>{a}</button>)}</div>
        )}
        <form className="chat-input" onSubmit={submit}>
          <textarea rows={2} value={text} placeholder="Например: для Мобильного банка нужны 2 senior backend-разработчика на Java с 1 декабря на полгода"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <button className="btn btn-primary" disabled={busy || !text.trim()}>Отправить</button>
        </form>
      </div>
    </div>
  );
}
