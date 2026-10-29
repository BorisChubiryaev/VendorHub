import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Field } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);

  useEffect(() => {
    api<{ ephemeral: boolean }>('/health').then((h) => setEphemeral(h.ephemeral)).catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.login, form.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand brand-lg"><span className="brand-mark">VH</span><span>ВендорХаб</span></div>
        <p className="muted">Потребности в ИТ-ресурсах и бассейн кандидатов</p>
        {ephemeral && (
          <div className="alert alert-info small">Демо-стенд: данные периодически сбрасываются к исходному набору. Не вносите реальные данные.</div>
        )}
        <ErrorBox error={error} />
        <Field label="Логин">
          <input autoFocus value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} autoComplete="username" />
        </Field>
        <Field label="Пароль">
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy || !form.login || !form.password}>{busy ? 'Вход…' : 'Войти'}</button>
        <details className="demo-users" open={ephemeral}>
          <summary>Демо-пользователи стенда</summary>
          <table className="table compact">
            <tbody>
              <tr><td>customer / customer</td><td>Заказчик, трайб «Розничный бизнес»</td></tr>
              <tr><td>customer2 / customer2</td><td>Заказчик, трайб «Корпоративный бизнес»</td></tr>
              <tr><td>manager / manager</td><td>Менеджер бассейна</td></tr>
              <tr><td>admin / admin</td><td>Обе роли</td></tr>
            </tbody>
          </table>
        </details>
      </form>
    </div>
  );
}
