import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, qs } from '../api';
import { useAuth, useDict } from '../auth';
import { ErrorBox, Field, Modal, TagInput } from '../components/ui';
import type { Need } from '../types';

interface PositionForm {
  key: number;
  role: string;
  level: string;
  quantity: number;
  skills: string[];
  start_date: string;
  end_date: string;
}

interface BacklogItem { key: string; url: string; summary: string; description?: string | null }

let seq = 1;
const emptyPosition = (): PositionForm => ({ key: seq++, role: '', level: '', quantity: 1, skills: [], start_date: '', end_date: '' });

export default function NeedFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const dict = useDict();
  const navigate = useNavigate();
  const [product, setProduct] = useState('');
  const [backlogRef, setBacklogRef] = useState('');
  const [backlogItem, setBacklogItem] = useState<BacklogItem | null>(null);
  const [requirements, setRequirements] = useState('');
  const [positions, setPositions] = useState<PositionForm[]>([emptyPosition()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<Need>(`/needs/${id}`).then((n) => {
      if (n.status !== 'draft') return navigate(`/needs/${id}`, { replace: true });
      setProduct(n.product);
      setRequirements(n.requirements_summary ?? '');
      if (n.backlog_key) {
        setBacklogRef(n.backlog_url ?? n.backlog_key);
        setBacklogItem({ key: n.backlog_key, url: n.backlog_url ?? '', summary: n.requirements_summary ?? '' });
      }
      setPositions(n.positions.length ? n.positions.map((p) => ({
        key: seq++, role: p.role, level: p.level ?? '', quantity: p.quantity, skills: p.skills,
        start_date: p.start_date ?? '', end_date: p.end_date ?? '',
      })) : [emptyPosition()]);
    }).catch((e) => setError(e.message));
  }, [id, navigate]);

  const lookup = async () => {
    setLookupMsg(null);
    if (!backlogRef.trim()) return;
    try {
      const item = await api<BacklogItem>(`/backlog/lookup${qs({ ref: backlogRef })}`);
      setBacklogItem(item);
      if (!requirements.trim()) setRequirements(item.summary);
    } catch (e) {
      setBacklogItem(null);
      setLookupMsg((e as Error).message);
    }
  };

  const updatePos = (key: number, patch: Partial<PositionForm>) => setPositions((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const save = async (submit: boolean) => {
    setBusy(true);
    setError(null);
    const body = {
      product,
      backlog_key: backlogItem?.key ?? null,
      backlog_url: backlogItem?.url ?? null,
      requirements_summary: requirements || null,
      positions: positions.filter((p) => p.role.trim()).map((p) => ({
        role: p.role, level: p.level || null, quantity: Number(p.quantity) || 1, skills: p.skills,
        start_date: p.start_date || null, end_date: p.end_date || null,
      })),
      submit,
    };
    try {
      const need = id
        ? await api<Need>(`/needs/${id}`, { method: 'PUT', json: body })
        : await api<Need>('/needs', { method: 'POST', json: body });
      navigate(`/needs/${need.id}`);
    } catch (e) {
      const err = e as ApiError;
      setError(err.details?.errors ? err.details.errors.join('\n') : err.message);
      // черновик мог создаться до ошибки валидации при отправке — ведём на редактирование
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (id) {
      if (!confirm('Отменить потребность? Она не будет отправлена на подбор.')) return;
      await api(`/needs/${id}/cancel`, { method: 'POST' }).catch(() => {});
      navigate(`/needs/${id}`);
    } else navigate('/needs');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{id ? `Потребность #${id} — черновик` : 'Новая потребность'}</h1>
      </div>
      <ErrorBox error={error} />

      <section className="card">
        <h2>Общие сведения</h2>
        <div className="grid-3">
          <Field label="Инициатор"><input value={user?.full_name ?? ''} disabled /></Field>
          <Field label="Трайб"><input value={user?.tribe_name ?? ''} disabled /></Field>
          <Field label="Продукт" required hint="Начните вводить — подскажем продукты трайба">
            <input list="need-products" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Например, Мобильный банк" />
            <datalist id="need-products">{dict.products.map((p) => <option key={p.id} value={p.name}>{p.tribe_name}</option>)}</datalist>
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>Требования к реализации</h2>
        <div className="row gap align-end">
          <Field label="Ссылка на объект бэклога (СберТрек / Jira)" hint={lookupMsg ?? (backlogItem ? `Найдено: ${backlogItem.key}` : 'Ключ (VH-1) или ссылка')}>
            <input value={backlogRef} onChange={(e) => { setBacklogRef(e.target.value); setBacklogItem(null); }} onBlur={lookup} placeholder="https://jira/browse/VH-1" />
          </Field>
          <button type="button" className="btn" onClick={lookup}>Найти</button>
          <button type="button" className="btn" onClick={() => setShowBacklog(true)}>Создать объект бэклога…</button>
        </div>
        {backlogItem && (
          <div className="backlog-item">
            <a href={backlogItem.url} target="_blank" rel="noreferrer"><b>{backlogItem.key}</b></a> — {backlogItem.summary}
          </div>
        )}
        <Field label="Summary требований" hint="Подтягивается из объекта бэклога; можно уточнить">
          <textarea rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Что нужно реализовать" />
        </Field>
      </section>

      <section className="card">
        <div className="row space-between">
          <h2>Ролевой состав</h2>
          <button type="button" className="btn" onClick={() => setPositions([...positions, emptyPosition()])}>+ Добавить позицию</button>
        </div>
        <datalist id="roles">{dict.roles.map((r) => <option key={r} value={r} />)}</datalist>
        <div className="positions-form">
          {positions.map((p, i) => (
            <div key={p.key} className="position-form">
              <div className="position-num">{i + 1}</div>
              <div className="position-fields">
                <div className="grid-4">
                  <Field label="Роль" required><input list="roles" value={p.role} onChange={(e) => updatePos(p.key, { role: e.target.value })} /></Field>
                  <Field label="Уровень">
                    <select value={p.level} onChange={(e) => updatePos(p.key, { level: e.target.value })}>
                      <option value="">Любой</option>
                      {dict.levels.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Количество" required><input type="number" min={1} max={50} value={p.quantity} onChange={(e) => updatePos(p.key, { quantity: Number(e.target.value) })} /></Field>
                  <div className="grid-2">
                    <Field label="Начало работ" required><input type="date" value={p.start_date} onChange={(e) => updatePos(p.key, { start_date: e.target.value })} /></Field>
                    <Field label="Окончание" required><input type="date" min={p.start_date} value={p.end_date} onChange={(e) => updatePos(p.key, { end_date: e.target.value })} /></Field>
                  </div>
                </div>
                <Field label="Навыки">
                  <TagInput value={p.skills} onChange={(skills) => updatePos(p.key, { skills })} suggestions={dict.skills} placeholder="Java, Kafka…" />
                </Field>
              </div>
              <button type="button" className="icon-btn" title="Удалить позицию" disabled={positions.length === 1} onClick={() => setPositions(positions.filter((x) => x.key !== p.key))}>×</button>
            </div>
          ))}
        </div>
      </section>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Отправить на подбор вариантов</button>
        <button className="btn" disabled={busy} onClick={() => save(false)}>Сохранить черновик</button>
        <button className="btn btn-ghost" disabled={busy} onClick={cancel}>Отменить</button>
        {id && <Link className="btn btn-ghost" to={`/needs/${id}`}>К карточке</Link>}
      </div>

      {showBacklog && (
        <CreateBacklogModal
          product={product}
          requirements={requirements}
          onClose={() => setShowBacklog(false)}
          onCreated={(item) => {
            setBacklogItem(item);
            setBacklogRef(item.url);
            if (!requirements.trim()) setRequirements(item.description || item.summary);
            setShowBacklog(false);
          }}
        />
      )}
    </div>
  );
}

function CreateBacklogModal({ product, requirements, onClose, onCreated }: { product: string; requirements: string; onClose: () => void; onCreated: (i: BacklogItem) => void }) {
  const [summary, setSummary] = useState(product ? `${product}: ` : '');
  const [description, setDescription] = useState(requirements);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ item: BacklogItem; created: boolean } | null>(null);
  const [similar, setSimilar] = useState<BacklogItem[]>([]);

  useEffect(() => {
    if (summary.trim().length < 8) return setSimilar([]);
    const t = setTimeout(() => api<BacklogItem[]>(`/backlog/search${qs({ q: summary })}`).then(setSimilar).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [summary]);

  const create = async () => {
    setError(null);
    try {
      const r = await api<{ item: BacklogItem; created: boolean }>('/backlog', { method: 'POST', json: { summary, description } });
      if (r.created) onCreated(r.item);
      else setResult(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Новый объект бэклога" onClose={onClose} footer={
      <>
        <button className="btn btn-primary" onClick={create} disabled={summary.trim().length < 5}>Создать</button>
        <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
      </>
    }>
      <ErrorBox error={error} />
      <Field label="Название (summary)" required><input value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <Field label="Функциональные требования"><textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {similar.length > 0 && (
        <div className="alert alert-info">
          Похожие объекты уже есть — возможно, создавать новый не нужно:
          {similar.map((s) => (
            <div key={s.key} className="row gap">
              <span><b>{s.key}</b> — {s.summary}</span>
              <button className="btn btn-sm" onClick={() => onCreated(s)}>Использовать</button>
            </div>
          ))}
        </div>
      )}
      {result && !result.created && (
        <div className="alert alert-info">
          Объект с таким названием уже существует: <b>{result.item.key}</b>.{' '}
          <button className="btn btn-sm" onClick={() => onCreated(result.item)}>Использовать его</button>
        </div>
      )}
    </Modal>
  );
}
