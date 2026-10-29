import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useDict } from '../auth';
import { Badge, ErrorBox, Field } from '../components/ui';

interface Result { file: string; status: 'ok' | 'error'; id?: number; full_name?: string | null; missing?: string[]; error?: string }

const FIELD_NAMES: Record<string, string> = {
  full_name: 'ФИО', age: 'возраст', city: 'город', role: 'роль', level: 'уровень', total_experience: 'опыт', rate: 'ставка', skills: 'навыки',
};

export default function ImportPage() {
  const dict = useDict();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    if (vendorId) fd.append('vendor_id', vendorId);
    try {
      const r = await api<{ results: Result[] }>('/candidates/import', { method: 'POST', body: fd });
      setResults((prev) => [...r.results, ...prev]);
      setFiles([]);
      if (input.current) input.current.value = '';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><Link to="/pool">Бассейн</Link> / импорт</div>
          <h1>Импорт и распознавание резюме</h1>
        </div>
      </div>
      <section className="card">
        <p className="muted">Выберите один или несколько файлов резюме в формате PDF. По каждому файлу будет создана карточка кандидата в статусе «Черновик» — проверьте распознанные поля и активируйте её.</p>
        <div className="row gap align-end wrap">
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          <button className="btn" onClick={() => input.current?.click()}>Выбрать файлы…</button>
          <Field label="Подрядчик (для всех файлов)">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">— указать позже —</option>
              {dict.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <button className="btn btn-primary" disabled={!files.length || busy} onClick={upload}>{busy ? 'Распознаём…' : `Загрузить (${files.length})`}</button>
        </div>
        {files.length > 0 && <ul className="file-list">{files.map((f) => <li key={f.name}>{f.name} <span className="muted small">{Math.round(f.size / 1024)} КБ</span></li>)}</ul>}
      </section>
      <ErrorBox error={error} />
      {results.length > 0 && (
        <section className="card">
          <h2>Результаты обработки</h2>
          <table className="table">
            <thead><tr><th>Файл</th><th>Статус</th><th>ID</th><th>Карточка</th><th>Не распознано</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.file}</td>
                  <td>{r.status === 'ok' ? <Badge tone="green">Обработан</Badge> : <Badge tone="red">Ошибка</Badge>}</td>
                  <td>{r.id ?? '—'}</td>
                  <td>{r.id ? <Link to={`/pool/${r.id}/edit`}>{r.full_name || 'Кандидат'} — черновик</Link> : <span className="muted">{r.error}</span>}</td>
                  <td className="small">{r.missing?.length ? r.missing.map((m) => FIELD_NAMES[m] ?? m).join(', ') : r.status === 'ok' ? 'всё распознано' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
