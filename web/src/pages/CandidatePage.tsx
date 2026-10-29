import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, tokenStore } from '../api';
import { useAuth, useDict } from '../auth';
import { EngagementBanner, ErrorBox, RelevanceDetails, Stars, StatusBadge, useLoad } from '../components/ui';
import { fmtDate, fmtRate, years } from '../format';
import type { Candidate, Position, SupplyOption } from '../types';

type Detailed = Candidate & { engagement?: SupplyOption | null; position?: Position & { need_id: number } };

export default function CandidatePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const positionId = params.get('positionId');
  const { role } = useAuth();
  const dict = useDict();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { data: c, error: loadError } = useLoad(
    () => api<Detailed>(`/candidates/${id}${positionId ? `?positionId=${positionId}` : ''}`), [id, positionId],
  );
  if (loadError) return <div className="page"><ErrorBox error={loadError} /></div>;
  if (!c) return <div className="page muted">Загрузка…</div>;
  const isManager = role === 'pool_manager';

  const choose = async () => {
    try {
      await api(`/positions/${positionId}`, { method: 'PATCH', json: { option: `c:${c.id}` } });
      navigate(`/needs/${c.position!.need_id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rows: [string, React.ReactNode][] = [
    ['Возраст', c.age ? `${c.age}` : '—'],
    ['Роль и уровень', `${c.role ?? '—'} ${c.level ?? ''}`],
    ['Рейтинг', <Stars value={c.rating} />],
    ['Интервал доступности', `${fmtDate(c.available_from)} – ${fmtDate(c.available_to)}`],
    ['Суммарный опыт', years(c.total_experience)],
    ['Статус проверки УВБ', <StatusBadge status={c.uvb_status} names={dict.uvbStatuses} />],
    ['Город', c.city ?? '—'],
    ['Ставка', fmtRate(c.rate)],
    ['Подрядчик', c.vendor_name ?? '—'],
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="breadcrumbs">
            {c.position ? <Link to={`/needs/${c.position.need_id}`}>Потребность #{c.position.need_id}</Link> : <Link to={isManager ? '/pool' : '/candidates'}>Кандидаты</Link>} / карточка кандидата
          </div>
          <h1>{c.full_name || 'Без имени'} {isManager && <StatusBadge status={c.status} names={dict.candidateStatuses} />}</h1>
        </div>
        <div className="actions">
          {c.has_resume && <a className="btn" href={`/api/candidates/${c.id}/resume?token=${tokenStore.get()}`} target="_blank" rel="noreferrer">Резюме (PDF)</a>}
          {isManager && <Link className="btn btn-primary" to={`/pool/${c.id}/edit`}>Редактировать</Link>}
          {c.position && c.engagement && <button className="btn btn-primary" onClick={choose}>Выбрать на позицию</button>}
        </div>
      </div>
      <ErrorBox error={error} />

      {c.position && (
        <section className="card">
          <h2>Соответствие позиции «{c.position.role}{c.position.level ? ' ' + c.position.level : ''}»</h2>
          {c.relevance && <RelevanceDetails r={c.relevance} />}
          {c.engagement ? <EngagementBanner action={c.engagement.action} banner={`${c.engagement.title}. ${c.engagement.banner}`} caseNo={c.engagement.case} />
            : <div className="banner banner-red"><span className="banner-icon">✕</span>По подрядчику кандидата нет договора с лимитом, покрывающего интервал позиции</div>}
        </section>
      )}

      <div className="grid-2 align-start">
        <section className="card">
          <h2>Сведения</h2>
          <dl className="props">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <h3>Навыки</h3>
          <div className="chips">{c.skills.length ? c.skills.map((s) => <span key={s} className={`skill ${c.relevance?.skillsMatched.includes(s) ? 'skill-ok' : ''}`}>{s}</span>) : <span className="muted">не указаны</span>}</div>
        </section>
        <section className="card">
          <h2>Опыт в Сбере</h2>
          <p className="pre">{c.sber_experience || <span className="muted">нет</span>}</p>
          <h2>Опыт по резюме</h2>
          <p className="pre">{c.resume_experience || <span className="muted">нет</span>}</p>
        </section>
      </div>

      <section className="card">
        <h2>Отзывы</h2>
        {c.reviews.length === 0 ? <div className="muted">Отзывов пока нет</div> : c.reviews.map((r, i) => (
          <div key={i} className="review">
            <div className="row gap"><b>{r.author || 'Аноним'}</b>{r.score != null && <Stars value={r.score} />}<span className="muted small">{fmtDate(r.date)}</span></div>
            <div>{r.text}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
