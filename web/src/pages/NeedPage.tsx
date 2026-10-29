import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useDict } from '../auth';
import { Badge, EngagementBanner, ErrorBox, RelevanceBar, RelevanceDetails, Stars, StatusBadge, useLoad } from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtRate } from '../format';
import type { Need, SupplyOption, Wizard, WizardPosition } from '../types';

const EDITABLE = ['not_started', 'candidate_declined', 'interview_failed'];
const FAILABLE_STEPS = ['confirm', 'interview'];
const LIMIT_OWNER = { own: 'лимит вашего трайба', other: 'лимит другого трайба', reserve: 'лимит в резерве блока Т' };

export default function NeedPage() {
  const { id } = useParams();
  const dict = useDict();
  const { data: need, error, reload } = useLoad(() => api<Need>(`/needs/${id}`), [id]);

  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!need) return <div className="page muted">Загрузка…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><Link to="/needs">Мои потребности</Link> / #{need.id}</div>
          <h1>Потребность #{need.id} <StatusBadge status={need.status} names={dict.needStatuses} /></h1>
        </div>
      </div>
      <NeedSummary need={need} />
      {need.status === 'draft' || need.status === 'cancelled' ? <DraftView need={need} onChange={reload} /> : <WizardView needId={need.id} onNeedChange={reload} />}
    </div>
  );
}

function NeedSummary({ need }: { need: Need }) {
  return (
    <section className="card need-summary">
      <div><span className="muted">Продукт</span><b>{need.product || '—'}</b></div>
      <div><span className="muted">Инициатор</span>{need.initiator_name}</div>
      <div><span className="muted">Трайб</span>{need.tribe_name ?? '—'}</div>
      <div><span className="muted">Создана</span>{fmtDateTime(need.created_at)}</div>
      <div className="span-2">
        <span className="muted">Требования</span>
        {need.backlog_key && <a href={need.backlog_url ?? '#'} target="_blank" rel="noreferrer"><b>{need.backlog_key}</b></a>}{' '}
        {need.requirements_summary ?? (need.backlog_key ? '' : '—')}
      </div>
      {need.parent_need_id && <div><span className="muted">Выделена из</span><Link to={`/needs/${need.parent_need_id}`}>#{need.parent_need_id}</Link></div>}
    </section>
  );
}

function DraftView({ need, onChange }: { need: Need; onChange: () => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await api(`/needs/${need.id}/submit`, { method: 'POST' });
      onChange();
    } catch (e) {
      const err = e as ApiError;
      setError(err.details?.errors?.join('\n') ?? err.message);
    }
  };
  const cancel = async () => {
    if (!confirm('Отменить потребность?')) return;
    await api(`/needs/${need.id}/cancel`, { method: 'POST' });
    onChange();
  };
  return (
    <>
      <ErrorBox error={error} />
      <section className="card">
        <h2>Ролевой состав</h2>
        <table className="table">
          <thead><tr><th>#</th><th>Роль</th><th>Уровень</th><th>Кол-во</th><th>Навыки</th><th>Интервал</th></tr></thead>
          <tbody>
            {need.positions.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td><td>{p.role}</td><td>{p.level ?? 'любой'}</td><td>{p.quantity}</td>
                <td>{p.skills.join(', ') || '—'}</td><td className="nowrap">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {need.status === 'draft' && (
        <div className="form-actions">
          <button className="btn btn-primary" onClick={submit}>Отправить на подбор вариантов</button>
          <button className="btn" onClick={() => navigate(`/needs/${need.id}/edit`)}>Редактировать</button>
          <button className="btn btn-ghost" onClick={cancel}>Отменить потребность</button>
        </div>
      )}
    </>
  );
}

function WizardView({ needId, onNeedChange }: { needId: number; onNeedChange: () => void }) {
  const navigate = useNavigate();
  const { data: w, setData, error: loadError, reload } = useLoad(() => api<Wizard>(`/needs/${needId}/wizard`), [needId]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const act = async (fn: () => Promise<Wizard | unknown>, opts: { refreshNeed?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'positions' in (r as Wizard)) setData(r as Wizard);
      else await reload();
      if (opts.refreshNeed) onNeedChange();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorBox error={loadError} />;
  if (!w) return <div className="muted">Подбор вариантов…</div>;

  const editable = w.positions.filter((p) => EDITABLE.includes(p.route_status));
  const selectedEditable = selected.filter((id) => editable.some((p) => p.id === id));
  const scenario = w.need.scenario ?? 'best';
  const counts = { recommend: 0, procurement: 0, vendor: 0 };
  for (const p of w.positions) if (p.selected) counts[p.selected.action]++;

  const group = (path: string, confirmText?: string) => async () => {
    if (confirmText && !confirm(confirmText)) return;
    const ok = await act(() => api(`/needs/${needId}/${path}`, { method: 'POST', json: { ids: selectedEditable } }), { refreshNeed: true });
    if (ok) setSelected([]);
  };

  const split = async () => {
    if (!confirm(`Перенести ${selectedEditable.length} поз. в новую потребность?`)) return;
    setBusy(true);
    try {
      const r = await api<{ id: number }>(`/needs/${needId}/split`, { method: 'POST', json: { ids: selectedEditable } });
      navigate(`/needs/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card">
        <div className="row space-between wrap gap">
          <div>
            <h2>Варианты обеспечения</h2>
            <div className="muted small">Сценарий комплексного обеспечения всех позиций. Любое ручное изменение формирует «Свой сценарий».</div>
          </div>
          <div className="scenario-tabs">
            {(['best', 'fast', 'cheap'] as const).map((s) => (
              <button key={s} className={scenario === s ? 'active' : ''} disabled={busy || !editable.length}
                onClick={() => act(() => api(`/needs/${needId}/scenario`, { method: 'POST', json: { scenario: s } }))}>
                {w.scenarios[s]}
              </button>
            ))}
            <button className={scenario === 'custom' ? 'active' : ''} disabled title="Формируется при ручном изменении любого сценария">{w.scenarios.custom}</button>
          </div>
        </div>
        <div className="stats">
          <div><span className="stat-value">{w.positions.length}</span><span className="muted">позиций</span></div>
          <div><span className="stat-value green">{counts.recommend}</span><span className="muted">кандидат + лимит есть</span></div>
          <div><span className="stat-value blue">{counts.vendor}</span><span className="muted">к вендору</span></div>
          <div><span className="stat-value amber">{counts.procurement}</span><span className="muted">через закупки</span></div>
          <div><span className="stat-value">{fmtMoney(w.totalCost)}</span><span className="muted">оценка бюджета</span></div>
        </div>
      </section>

      <ErrorBox error={error} />

      <div className="toolbar sticky">
        <label className="inline">
          <input type="checkbox" checked={editable.length > 0 && selectedEditable.length === editable.length}
            onChange={(e) => setSelected(e.target.checked ? editable.map((p) => p.id) : [])} disabled={!editable.length} />
          Выбрать все ({selectedEditable.length})
        </label>
        <button className="btn btn-primary btn-sm" disabled={busy || !selectedEditable.length} onClick={group('positions/launch', 'Запустить выбранные позиции на маршрут? Потребность будет передана в штаб.')}>Запустить на маршрут</button>
        <button className="btn btn-sm" disabled={busy || !selectedEditable.length} onClick={split}>Перенести в новую потребность</button>
        <button className="btn btn-sm btn-danger-ghost" disabled={busy || !selectedEditable.length} onClick={group('positions/delete', 'Удалить выбранные позиции из потребности?')}>Удалить</button>
        <span className="spacer" />
        <button className="btn btn-sm" disabled={busy || !w.positions.some((p) => p.route_status === 'not_started')}
          onClick={() => confirm('Передать в штаб все позиции, по которым ещё не запущен маршрут?') && act(() => api(`/needs/${needId}/hq`, { method: 'POST' }), { refreshNeed: true })}>
          Передать всё в штаб
        </button>
        {w.need.status === 'matching' && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => confirm('Отменить потребность?') && act(() => api(`/needs/${needId}/cancel`, { method: 'POST' }), { refreshNeed: true })}>Отменить потребность</button>
        )}
      </div>

      <div className="positions">
        {w.positions.map((p, i) => (
          <PositionCard key={p.id} n={i + 1} p={p} busy={busy}
            takenBy={Object.fromEntries(w.positions.flatMap((q, j) => (q.id !== p.id && q.candidate_id ? [[q.candidate_id, j + 1]] : [])))}
            checked={selected.includes(p.id)}
            onCheck={(c) => setSelected(c ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
            onPatch={(body: { interview_required?: boolean; option?: string }) => {
              // признак собеседования применяем сразу, не дожидаясь ответа сервера
              if (body.interview_required !== undefined) {
                setData({ ...w, positions: w.positions.map((x) => (x.id === p.id ? { ...x, interview_required: body.interview_required! } : x)) });
              }
              act(() => api(`/positions/${p.id}`, { method: 'PATCH', json: body }));
            }}
            onAdvance={(outcome) => act(() => api(`/positions/${p.id}/advance`, { method: 'POST', json: { outcome } }), { refreshNeed: true })}
          />
        ))}
      </div>

      <section className="card">
        <button className="link" onClick={() => setShowLog(!showLog)}>{showLog ? '▾' : '▸'} Журнал интеграций ({w.events.length})</button>
        {showLog && (
          <table className="table compact">
            <thead><tr><th>Время</th><th>Система</th><th>Направление</th><th>Объект</th><th>Данные</th></tr></thead>
            <tbody>
              {w.events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtDateTime(e.created_at)}</td>
                  <td>{e.systemName}</td>
                  <td>{e.direction === 'out' ? '→ отправлено' : '← получено'}</td>
                  <td>{e.entity === 'need' ? 'потребность' : 'позиция'} #{e.entity_id}</td>
                  <td><code className="small">{JSON.stringify(e.payload)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function PositionCard({ n, p, checked, busy, takenBy, onCheck, onPatch, onAdvance }: {
  n: number; p: WizardPosition; checked: boolean; busy: boolean; takenBy: Record<number, number>;
  onCheck: (c: boolean) => void; onPatch: (body: { interview_required?: boolean; option?: string }) => void; onAdvance: (o: 'success' | 'fail') => void;
}) {
  const dict = useDict();
  const [open, setOpen] = useState(false);
  const editable = EDITABLE.includes(p.route_status);
  const o = p.selected;
  const activeStep = p.route_steps.find((s) => s.status === 'active');

  return (
    <section className={`card position-card ${checked ? 'checked' : ''}`}>
      <div className="position-head">
        <input type="checkbox" checked={checked} disabled={!editable} onChange={(e) => onCheck(e.target.checked)} aria-label="Выбрать позицию" />
        <div className="position-title">
          <b>{n}. {p.role}</b>{p.level && <span className="muted"> · {p.level}</span>}
          <div className="muted small">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}{p.skills.length > 0 && ' · ' + p.skills.join(', ')}</div>
        </div>
        <StatusBadge status={p.route_status} names={dict.routeStatuses} />
      </div>

      <div className="position-body">
        <div className="option-main">
          {!o ? <div className="muted">Вариант не выбран</div> : <OptionView o={o} positionId={p.id} />}
        </div>
        <div className="option-side">
          <label className="inline">
            <input type="checkbox" checked={p.interview_required} disabled={!editable || busy} onChange={(e) => onPatch({ interview_required: e.target.checked })} />
            Нужно собеседование
          </label>
          {o?.candidate && <Link className="btn btn-sm" to={`/candidates/${o.candidate.id}?positionId=${p.id}`}>Карточка кандидата</Link>}
          {editable && <Link className="btn btn-sm" to={`/candidates?positionId=${p.id}`}>Ручной поиск замены</Link>}
          {editable && <button className="btn btn-sm" onClick={() => setOpen(!open)}>{open ? 'Скрыть варианты' : `Другие варианты (${p.optionsTotal})`}</button>}
        </div>
      </div>

      {p.route_steps.length > 0 && (
        <div className="route">
          <div className="route-title">Маршрут — сценарий {p.route_scenario}</div>
          <ol className="steps">
            {p.route_steps.map((s) => (
              <li key={s.step} className={`step step-${s.status}`}>
                <span className="step-dot" />
                <span>{s.title}</span>
              </li>
            ))}
          </ol>
          {activeStep && (
            <div className="emulator">
              <span className="muted small">Эмулятор ответа внешней системы (стенд ИФТ):</span>
              <button className="btn btn-sm" disabled={busy} onClick={() => onAdvance('success')}>✓ Шаг выполнен</button>
              {FAILABLE_STEPS.includes(activeStep.step) && (
                <button className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={() => onAdvance('fail')}>
                  ✕ {activeStep.step === 'confirm' ? 'Кандидат отказался' : 'Собеседование не пройдено'}
                </button>
              )}
            </div>
          )}
          {['candidate_declined', 'interview_failed'].includes(p.route_status) && (
            <div className="alert alert-warn">Выберите другого кандидата или вариант обеспечения и запустите позицию на маршрут повторно.</div>
          )}
        </div>
      )}

      {open && editable && (
        <div className="options-list">
          <table className="table compact hover">
            <thead><tr><th>Вариант</th><th>Релевантность</th><th>Схема</th><th>Ставка</th><th>Бюджет</th><th>Выход</th><th /></tr></thead>
            <tbody>
              {p.options.map((opt) => (
                <tr key={opt.key} className={opt.key === o?.key ? 'selected-row' : ''}>
                  <td>
                    {opt.candidate ? (
                      <><Link to={`/candidates/${opt.candidate.id}?positionId=${p.id}`}>{opt.candidate.full_name}</Link>
                        <div className="muted small">{opt.candidate.level} · {opt.candidate.vendor_name} · {opt.candidate.city}</div></>
                    ) : opt.contract ? (
                      <>Запрос у вендора: {opt.contract.vendorName}<div className="muted small">договор {opt.contract.number}</div></>
                    ) : 'Новый договор'}
                  </td>
                  <td>{opt.relevance ? <RelevanceBar value={opt.relevance.score} compact /> : <span className="muted">—</span>}</td>
                  <td><Badge tone={opt.action === 'recommend' ? 'green' : opt.action === 'vendor' ? 'blue' : 'amber'} title={opt.banner}>{opt.case}. {opt.action === 'recommend' ? 'рекомендация' : opt.action === 'vendor' ? 'к вендору' : 'закупки'}</Badge></td>
                  <td className="nowrap">{fmtRate(opt.rate)}</td>
                  <td className="nowrap">{fmtMoney(opt.estimatedCost)}</td>
                  <td className="nowrap">{fmtDate(opt.startDate)}</td>
                  <td>{opt.key === o?.key ? <Badge tone="green">выбран</Badge> : opt.candidate && takenBy[opt.candidate.id] ? <Badge tone="gray">на позиции {takenBy[opt.candidate.id]}</Badge> : <button className="btn btn-sm" disabled={busy} onClick={() => onPatch({ option: opt.key })}>Выбрать</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.optionsTotal > p.options.length && <div className="muted small">Показаны лучшие {p.options.length} из {p.optionsTotal}. Остальные — в <Link to={`/candidates?positionId=${p.id}`}>ручном поиске</Link>.</div>}
        </div>
      )}
    </section>
  );
}

function OptionView({ o, positionId }: { o: SupplyOption; positionId: number }) {
  const dict = useDict();
  return (
    <div className="option-view">
      {o.candidate ? (
        <div className="option-candidate">
          <div className="row gap wrap">
            <Link to={`/candidates/${o.candidate.id}?positionId=${positionId}`} className="candidate-name">{o.candidate.full_name}</Link>
            <Stars value={o.candidate.rating} />
            <StatusBadge status={o.candidate.uvb_status} names={{ ...dict.uvbStatuses, passed: 'УВБ ✓' }} />
          </div>
          <div className="muted small">
            {o.candidate.role} {o.candidate.level} · {o.candidate.vendor_name} · {o.candidate.city ?? '—'} · {fmtRate(o.rate)} · выход с {fmtDate(o.startDate)}
          </div>
          {o.relevance && <RelevanceDetails r={o.relevance} />}
        </div>
      ) : o.contract ? (
        <div>
          <b>Запрос кандидатов у вендора {o.contract.vendorName}</b>
          <div className="muted small">Договор {o.contract.number} ({fmtDate(o.contract.start)} – {fmtDate(o.contract.end)}) · ставка по договору {fmtRate(o.rate)} · ориентировочный выход {fmtDate(o.startDate)}</div>
        </div>
      ) : (
        <div><b>Новый договор</b><div className="muted small">В реестре нет договора с лимитом, содержащего роль и покрывающего интервал позиции.</div></div>
      )}
      {o.contract && o.limit && (
        <div className="muted small">
          Договор {o.contract.number} · {LIMIT_OWNER[o.limit.owner]}{o.limit.tribeName && o.limit.owner !== 'own' ? ` («${o.limit.tribeName}»)` : ''} · бюджет позиции {fmtMoney(o.estimatedCost)}
        </div>
      )}
      <EngagementBanner action={o.action} banner={o.banner} caseNo={o.case} />
    </div>
  );
}
