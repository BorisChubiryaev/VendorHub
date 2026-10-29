import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import type { Relevance } from '../types';

/** Загрузка данных с повторным запросом по reload(). */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    setLoading(true);
    return run()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, error, loading, reload };
}

export function ErrorBox({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="alert alert-error">{error}</div>;
}

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const TONES: Record<string, string> = {
  draft: 'gray', matching: 'blue', in_hq: 'amber', completed: 'green', cancelled: 'red',
  active: 'green', archived: 'gray',
  not_checked: 'gray', in_progress: 'amber', passed: 'green', failed: 'red',
  not_started: 'gray', candidate_confirmation: 'blue', candidate_declined: 'red', interviewing: 'blue',
  interview_failed: 'red', limit_transfer: 'amber', request_approval: 'amber', contract_conclusion: 'amber', approved: 'green',
};

export function Badge({ tone = 'gray', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function StatusBadge({ status, names }: { status: string; names: Record<string, string> }) {
  return <Badge tone={TONES[status] ?? 'gray'}>{names[status] ?? status}</Badge>;
}

export function RelevanceBar({ value, compact }: { value: number; compact?: boolean }) {
  const tone = value >= 80 ? 'green' : value >= 60 ? 'amber' : 'red';
  return (
    <span className={`relevance ${compact ? 'compact' : ''}`} title={`Релевантность ${value}%`}>
      <span className="relevance-track"><span className={`relevance-fill fill-${tone}`} style={{ width: `${value}%` }} /></span>
      <span className="relevance-value">{value}%</span>
    </span>
  );
}

const LEVEL_TEXT = { exact: 'уровень совпадает', near: 'уровень близкий', other: 'уровень не совпадает', any: 'уровень не задан' };
const AVAIL_TEXT = { full: 'доступен на весь срок', partial: 'доступен частично', none: 'недоступен в эти даты', unknown: 'доступность не указана' };

export function RelevanceDetails({ r }: { r: Relevance }) {
  return (
    <div className="relevance-details">
      <RelevanceBar value={r.score} />
      <div className="chips">
        <Badge tone={r.role ? 'green' : 'red'}>{r.role ? 'роль совпадает' : 'другая роль'}</Badge>
        <Badge tone={r.level === 'exact' || r.level === 'any' ? 'green' : r.level === 'near' ? 'amber' : 'red'}>{LEVEL_TEXT[r.level]}</Badge>
        <Badge tone={r.availability === 'full' ? 'green' : r.availability === 'partial' ? 'amber' : r.availability === 'none' ? 'red' : 'gray'}>
          {AVAIL_TEXT[r.availability]}{r.availability === 'partial' ? ` (${Math.round(r.coverage * 100)}%)` : ''}
        </Badge>
      </div>
      {(r.skillsMatched.length > 0 || r.skillsMissing.length > 0) && (
        <div className="chips">
          {r.skillsMatched.map((s) => <span key={s} className="skill skill-ok">✓ {s}</span>)}
          {r.skillsMissing.map((s) => <span key={s} className="skill skill-missing">✕ {s}</span>)}
        </div>
      )}
    </div>
  );
}

export function EngagementBanner({ action, banner, caseNo }: { action: string; banner: string; caseNo?: number }) {
  const tone = action === 'recommend' ? 'green' : action === 'vendor' ? 'blue' : 'amber';
  const icon = action === 'recommend' ? '✓' : action === 'vendor' ? '→' : '!';
  return (
    <div className={`banner banner-${tone}`}>
      <span className="banner-icon">{icon}</span>
      <span>{banner}</span>
      {caseNo && <span className="banner-case" title="Вариант обеспечения по схеме">вариант {caseNo}</span>}
    </div>
  );
}

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Ввод списка значений (навыки) с подсказками из справочника. */
export function TagInput({ value, onChange, suggestions, placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const listId = useId();
  const add = (raw: string) => {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const it of items) {
      const canonical = suggestions.find((s) => s.toLowerCase() === it.toLowerCase()) ?? it;
      if (!next.some((v) => v.toLowerCase() === canonical.toLowerCase())) next.push(canonical);
    }
    onChange(next);
    setText('');
  };
  return (
    <div className="tag-input">
      {value.map((v) => (
        <span key={v} className="tag">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Удалить ${v}`}>×</button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',') || suggestions.includes(v)) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text); }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">—</span>;
  return <span className="stars" title={`Рейтинг ${value} из 5`}>★ {value.toFixed(1)}</span>;
}
