import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useDict } from '../auth';
import { Badge, Empty, EngagementBanner, ErrorBox, RelevanceBar, Stars, StatusBadge, TagInput, useLoad } from '../components/ui';
import { fmtDate, fmtRate, years } from '../format';
import type { Candidate, Position } from '../types';

type Mode = 'customer' | 'manager';
type View = 'tiles' | 'table';

const emptyFilters = {
  q: '', status: '', created_by: '', role: '', level: '', vendor_id: '', city: '', uvb_status: '',
  available_from: '', available_to: '', min_rating: '', max_rate: '', skills: [] as string[],
};
type Filters = typeof emptyFilters;

const VIEW_KEY = 'vh_candidates_view';

export default function CandidatesPage({ mode }: { mode: Mode }) {
  const dict = useDict();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const positionId = mode === 'customer' ? params.get('positionId') : null;
  const [position, setPosition] = useState<(Position & { need_id: number; need_product: string }) | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters | null>(positionId ? null : emptyFilters);
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || 'tiles');
  const [error, setError] = useState<string | null>(null);

  // Преднастройка фильтров по параметрам позиции, из которой перешли
  useEffect(() => {
    if (!positionId) return;
    api<Position & { need_id: number; need_product: string }>(`/positions/${positionId}`).then((p) => {
      setPosition(p);
      const preset = { ...emptyFilters, role: p.role, level: p.level ?? '', available_from: p.start_date ?? '', available_to: p.end_date ?? '' };
      setFilters(preset);
      setApplied(preset);
    }).catch((e) => { setError(e.message); setApplied(emptyFilters); });
  }, [positionId]);

  const { data, error: loadError, loading } = useLoad(
    () => (applied ? api<Candidate[]>(`/candidates${qs({ ...applied, skills: applied.skills.join(','), positionId })}`) : Promise.resolve(null)),
    [applied, positionId],
  );

  const setViewSaved = (v: View) => { setView(v); localStorage.setItem(VIEW_KEY, v); };
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const cardLink = (c: Candidate) => (mode === 'manager' ? `/pool/${c.id}` : `/candidates/${c.id}${positionId ? `?positionId=${positionId}` : ''}`);

  const choose = async (c: Candidate) => {
    if (!position) return;
    setError(null);
    try {
      await api(`/positions/${position.id}`, { method: 'PATCH', json: { option: `c:${c.id}` } });
      navigate(`/needs/${position.need_id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          {position && <div className="breadcrumbs"><Link to={`/needs/${position.need_id}`}>Потребность #{position.need_id}</Link> / ручной поиск замены</div>}
          <h1>{mode === 'manager' ? 'Бассейн кандидатов' : position ? `Подбор на позицию «${position.role}»` : 'Кандидаты из бассейна'}</h1>
        </div>
        <div className="actions">
          <div className="segmented">
            <button className={view === 'tiles' ? 'active' : ''} onClick={() => setViewSaved('tiles')}>Плитки</button>
            <button className={view === 'table' ? 'active' : ''} onClick={() => setViewSaved('table')}>Таблица</button>
          </div>
          {mode === 'manager' && (
            <>
              <Link className="btn" to="/pool/import">Импорт резюме</Link>
              <Link className="btn btn-primary" to="/pool/new">+ Кандидат</Link>
            </>
          )}
        </div>
      </div>

      {position && (
        <div className="alert alert-info">
          Фильтры преднастроены по позиции: {position.role}{position.level ? ` ${position.level}` : ''}, {fmtDate(position.start_date)} – {fmtDate(position.end_date)}
          {position.skills.length > 0 && <>; навыки позиции: {position.skills.join(', ')}</>}. Релевантность считается относительно позиции.
        </div>
      )}

      <form className="card filters-grid" onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
        <input placeholder="ФИО, опыт или ID" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        {mode === 'manager' && (
          <>
            <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Любой статус</option>
              {Object.entries(dict.candidateStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filters.created_by} onChange={(e) => set({ created_by: e.target.value })}>
              <option value="">Любой создатель</option>
              {dict.creators.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </>
        )}
        <select value={filters.role} onChange={(e) => set({ role: e.target.value })}>
          <option value="">Любая роль</option>
          {dict.roles.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={filters.level} onChange={(e) => set({ level: e.target.value })}>
          <option value="">Любой уровень</option>
          {dict.levels.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select value={filters.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })}>
          <option value="">Любой подрядчик</option>
          {dict.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={filters.city} onChange={(e) => set({ city: e.target.value })}>
          <option value="">Любой город</option>
          {dict.cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={filters.uvb_status} onChange={(e) => set({ uvb_status: e.target.value })}>
          <option value="">Проверка УВБ: любая</option>
          {Object.entries(dict.uvbStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="inline" title="Кандидат свободен на всём интервале">Доступен с <input type="date" value={filters.available_from} onChange={(e) => set({ available_from: e.target.value })} /></label>
        <label className="inline">по <input type="date" value={filters.available_to} onChange={(e) => set({ available_to: e.target.value })} /></label>
        <input type="number" min={0} max={5} step={0.5} placeholder="Рейтинг от" value={filters.min_rating} onChange={(e) => set({ min_rating: e.target.value })} />
        <input type="number" min={0} step={100} placeholder="Ставка до, ₽/ч" value={filters.max_rate} onChange={(e) => set({ max_rate: e.target.value })} />
        <div className="span-2"><TagInput value={filters.skills} onChange={(skills) => set({ skills })} suggestions={dict.skills} placeholder="Навыки (все обязательны)" /></div>
        <div className="row gap">
          <button className="btn btn-primary">Найти</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters); }}>Сбросить</button>
        </div>
      </form>

      <ErrorBox error={error ?? loadError} />
      {loading && !data ? <div className="muted">Загрузка…</div> : data && (
        <>
          <div className="muted small result-count">Найдено: {data.length}</div>
          {data.length === 0 ? <Empty>Кандидатов по заданным параметрам нет. Попробуйте ослабить фильтры.</Empty> : view === 'tiles' ? (
            <div className="tiles">
              {data.map((c) => (
                <div key={c.id} className="card tile">
                  <div className="row space-between">
                    <Link to={cardLink(c)} className="candidate-name">{c.full_name || <i>Без имени</i>}</Link>
                    {mode === 'manager' && <StatusBadge status={c.status} names={dict.candidateStatuses} />}
                  </div>
                  <div className="muted small">{c.role ?? '—'} {c.level ?? ''} · {c.vendor_name ?? 'подрядчик не указан'}</div>
                  <div className="tile-meta">
                    <span>{c.city ?? '—'}</span><span>{fmtRate(c.rate)}</span><Stars value={c.rating} /><span>опыт {years(c.total_experience)}</span>
                  </div>
                  <div className="muted small">Доступен: {fmtDate(c.available_from)} – {fmtDate(c.available_to)}</div>
                  <div className="chips">{c.skills.slice(0, 8).map((s) => <span key={s} className={`skill ${c.relevance?.skillsMatched.includes(s) ? 'skill-ok' : ''}`}>{s}</span>)}</div>
                  {c.relevance && <RelevanceBar value={c.relevance.score} />}
                  {positionId && (c.engagement ? <EngagementBanner action={c.engagement.action} banner={c.engagement.banner} caseNo={c.engagement.case} />
                    : <div className="banner banner-red"><span className="banner-icon">✕</span>Нет договора с лимитом на интервал позиции — привлечь нельзя</div>)}
                  {position && c.engagement && <button className="btn btn-sm btn-primary" onClick={() => choose(c)}>Выбрать на позицию</button>}
                </div>
              ))}
            </div>
          ) : (
            <div className="card table-wrap">
              <table className="table hover">
                <thead>
                  <tr>
                    <th>ID</th><th>ФИО</th>{mode === 'manager' && <th>Статус</th>}<th>Роль / уровень</th><th>Подрядчик</th><th>Город</th>
                    <th>Ставка</th><th>Рейтинг</th><th>Доступен</th><th>УВБ</th>{positionId && <th>Релевантность</th>}{position && <th />}
                    {mode === 'manager' && <th>Создатель</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} onClick={() => navigate(cardLink(c))}>
                      <td>{c.id}</td>
                      <td>{c.full_name || <i className="muted">без имени</i>}</td>
                      {mode === 'manager' && <td><StatusBadge status={c.status} names={dict.candidateStatuses} /></td>}
                      <td>{c.role ?? '—'} <span className="muted">{c.level}</span></td>
                      <td>{c.vendor_name ?? '—'}</td>
                      <td>{c.city ?? '—'}</td>
                      <td className="nowrap">{fmtRate(c.rate)}</td>
                      <td><Stars value={c.rating} /></td>
                      <td className="nowrap small">{fmtDate(c.available_from)} – {fmtDate(c.available_to)}</td>
                      <td><StatusBadge status={c.uvb_status} names={dict.uvbStatuses} /></td>
                      {positionId && <td>{c.relevance && <RelevanceBar value={c.relevance.score} compact />}{!c.engagement && <Badge tone="red">нельзя привлечь</Badge>}</td>}
                      {position && <td>{c.engagement && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); choose(c); }}>Выбрать</button>}</td>}
                      {mode === 'manager' && <td className="small">{c.created_by_name}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
