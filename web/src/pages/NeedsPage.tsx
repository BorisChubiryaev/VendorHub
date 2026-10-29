import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { useDict } from '../auth';
import { Badge, Empty, ErrorBox, StatusBadge, useLoad } from '../components/ui';
import { fmtDate } from '../format';

interface NeedRow {
  id: number;
  status: string;
  product: string;
  initiator_name: string;
  start_date: string | null;
  backlog_key: string | null;
  source: string;
  positions: { role: string; count: number; statuses: Record<string, number> }[];
}

const SOURCE: Record<string, string> = { assistant: 'ассистент', sberchat: 'СберЧат', split: 'выделена' };

export default function NeedsPage() {
  const dict = useDict();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', status: '', product: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const { data, error, loading } = useLoad(() => api<NeedRow[]>(`/needs${qs(applied)}`), [applied]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Мои потребности</h1>
        <div className="actions">
          <Link className="btn" to="/assistant">Через ассистента</Link>
          <Link className="btn btn-primary" to="/needs/new">+ Новая потребность</Link>
        </div>
      </div>

      <form className="filters card" onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
        <input placeholder="Поиск: ID, продукт, роль, задача" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Все статусы</option>
          {Object.entries(dict.needStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Продукт" list="products" value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} />
        <datalist id="products">{dict.products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <label className="inline">Начало с <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="inline">по <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button className="btn">Найти</button>
        <button type="button" className="btn btn-ghost" onClick={() => { const empty = { search: '', status: '', product: '', from: '', to: '' }; setFilters(empty); setApplied(empty); }}>Сбросить</button>
      </form>

      <ErrorBox error={error} />
      {loading && !data ? <div className="muted">Загрузка…</div> : data && data.length === 0 ? (
        <Empty>Потребностей не найдено. <Link to="/needs/new">Зарегистрируйте первую</Link> или опишите её <Link to="/assistant">ассистенту</Link>.</Empty>
      ) : data && (
        <div className="card table-wrap">
          <table className="table hover">
            <thead>
              <tr><th>ID</th><th>Инициатор</th><th>Продукт</th><th>Дата начала работ</th><th>Состав и статус позиций</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {data.map((n) => (
                <tr key={n.id} onClick={() => navigate(`/needs/${n.id}`)}>
                  <td className="nowrap"><b>#{n.id}</b>{SOURCE[n.source] && <div className="muted small">{SOURCE[n.source]}</div>}</td>
                  <td>{n.initiator_name}</td>
                  <td>{n.product || <span className="muted">не указан</span>}{n.backlog_key && <div className="muted small">{n.backlog_key}</div>}</td>
                  <td className="nowrap">{fmtDate(n.start_date)}</td>
                  <td>
                    {n.positions.map((p) => (
                      <div key={p.role} className="pos-line">
                        <span>{p.role} × {p.count}</span>
                        {Object.entries(p.statuses).map(([s, c]) => <Badge key={s} tone="gray">{s}{c > 1 && p.count > 1 ? `: ${c}` : ''}</Badge>)}
                      </div>
                    ))}
                  </td>
                  <td><StatusBadge status={n.status} names={dict.needStatuses} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
