import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useDict } from '../auth';
import { ErrorBox, Field, TagInput } from '../components/ui';
import type { Candidate, Review } from '../types';

type Form = {
  status: string; full_name: string; age: string; role: string; level: string; skills: string[]; rating: string;
  available_from: string; available_to: string; total_experience: string; uvb_status: string; city: string; rate: string;
  sber_experience: string; resume_experience: string; reviews: Review[]; vendor_id: string;
};

const empty: Form = {
  status: 'draft', full_name: '', age: '', role: '', level: '', skills: [], rating: '', available_from: '', available_to: '',
  total_experience: '', uvb_status: 'not_checked', city: '', rate: '', sber_experience: '', resume_experience: '', reviews: [], vendor_id: '',
};

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const str = (v: unknown) => (v == null ? '' : String(v));

export default function CandidateFormPage() {
  const { id } = useParams();
  const dict = useDict();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(empty);
  const [meta, setMeta] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newReview, setNewReview] = useState<Review>({ author: '', text: '', score: null });

  useEffect(() => {
    if (!id) return;
    api<Candidate>(`/candidates/${id}`).then((c) => {
      setMeta(c);
      setForm({
        status: c.status, full_name: c.full_name, age: str(c.age), role: c.role ?? '', level: c.level ?? '', skills: c.skills,
        rating: str(c.rating), available_from: c.available_from ?? '', available_to: c.available_to ?? '',
        total_experience: str(c.total_experience), uvb_status: c.uvb_status, city: c.city ?? '', rate: str(c.rate),
        sber_experience: c.sber_experience ?? '', resume_experience: c.resume_experience ?? '', reviews: c.reviews, vendor_id: str(c.vendor_id),
      });
    }).catch((e) => setError(e.message));
  }, [id]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async (status?: string) => {
    setBusy(true);
    setError(null);
    const body = {
      ...form,
      status: status ?? form.status,
      age: num(form.age), rating: num(form.rating), total_experience: num(form.total_experience), rate: num(form.rate),
      available_from: form.available_from || null, available_to: form.available_to || null,
      vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
      role: form.role || null, level: form.level || null, city: form.city || null,
    };
    try {
      const c = await api<Candidate>(id ? `/candidates/${id}` : '/candidates', { method: id ? 'PUT' : 'POST', json: body });
      navigate(`/pool/${c.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addReview = () => {
    if (!newReview.text.trim()) return;
    set({ reviews: [...form.reviews, { ...newReview, date: new Date().toISOString().slice(0, 10) }] });
    setNewReview({ author: '', text: '', score: null });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><Link to="/pool">Бассейн</Link> / {id ? `кандидат #${id}` : 'новый кандидат'}</div>
          <h1>{id ? 'Редактирование карточки кандидата' : 'Новый кандидат'}</h1>
        </div>
        {meta?.has_resume && <Link className="btn" to={`/pool/${id}`}>Просмотр</Link>}
      </div>
      <ErrorBox error={error} />

      <section className="card">
        <div className="grid-4">
          <Field label="Статус карточки" required>
            <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {Object.entries(dict.candidateStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="span-2"><Field label="ФИО" required><input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} /></Field></div>
          <Field label="Возраст"><input type="number" min={14} max={100} value={form.age} onChange={(e) => set({ age: e.target.value })} /></Field>
          <Field label="Роль" required>
            <input list="roles" value={form.role} onChange={(e) => set({ role: e.target.value })} />
            <datalist id="roles">{dict.roles.map((r) => <option key={r} value={r} />)}</datalist>
          </Field>
          <Field label="Уровень">
            <select value={form.level} onChange={(e) => set({ level: e.target.value })}>
              <option value="">—</option>{dict.levels.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Подрядчик" required>
            <select value={form.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })}>
              <option value="">—</option>{dict.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Город">
            <input list="cities" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            <datalist id="cities">{dict.cities.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Рейтинг (0–5)"><input type="number" min={0} max={5} step={0.1} value={form.rating} onChange={(e) => set({ rating: e.target.value })} /></Field>
          <Field label="Суммарный опыт, лет"><input type="number" min={0} max={60} step={0.5} value={form.total_experience} onChange={(e) => set({ total_experience: e.target.value })} /></Field>
          <Field label="Ставка, ₽/час"><input type="number" min={0} step={50} value={form.rate} onChange={(e) => set({ rate: e.target.value })} /></Field>
          <Field label="Статус проверки УВБ">
            <select value={form.uvb_status} onChange={(e) => set({ uvb_status: e.target.value })}>
              {Object.entries(dict.uvbStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Доступен с"><input type="date" value={form.available_from} onChange={(e) => set({ available_from: e.target.value })} /></Field>
          <Field label="Доступен по"><input type="date" min={form.available_from} value={form.available_to} onChange={(e) => set({ available_to: e.target.value })} /></Field>
        </div>
        <Field label="Навыки"><TagInput value={form.skills} onChange={(skills) => set({ skills })} suggestions={dict.skills} placeholder="Добавьте навыки" /></Field>
        <div className="grid-2">
          <Field label="Опыт в Сбере"><textarea rows={4} value={form.sber_experience} onChange={(e) => set({ sber_experience: e.target.value })} /></Field>
          <Field label="Опыт по резюме"><textarea rows={4} value={form.resume_experience} onChange={(e) => set({ resume_experience: e.target.value })} /></Field>
        </div>
      </section>

      <section className="card">
        <h2>Отзывы</h2>
        {form.reviews.map((r, i) => (
          <div key={i} className="review row space-between">
            <div><b>{r.author || 'Аноним'}</b>{r.score ? ` · ★ ${r.score}` : ''}<div>{r.text}</div></div>
            <button className="icon-btn" onClick={() => set({ reviews: form.reviews.filter((_, j) => j !== i) })} aria-label="Удалить отзыв">×</button>
          </div>
        ))}
        <div className="grid-4 align-end">
          <Field label="Автор"><input value={newReview.author} onChange={(e) => setNewReview({ ...newReview, author: e.target.value })} /></Field>
          <div className="span-2"><Field label="Текст отзыва"><input value={newReview.text} onChange={(e) => setNewReview({ ...newReview, text: e.target.value })} /></Field></div>
          <div className="row gap align-end">
            <Field label="Оценка">
              <select value={newReview.score ?? ''} onChange={(e) => setNewReview({ ...newReview, score: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>{[1, 2, 3, 4, 5].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <button className="btn" type="button" onClick={addReview}>Добавить</button>
          </div>
        </div>
      </section>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => save()}>Сохранить</button>
        {form.status === 'draft' && <button className="btn" disabled={busy} onClick={() => save('active')}>Сохранить и активировать</button>}
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Отмена</button>
      </div>
    </div>
  );
}
