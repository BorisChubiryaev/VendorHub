import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_NAMES, useAuth } from './auth';
import AssistantPage from './pages/AssistantPage';
import CandidateFormPage from './pages/CandidateFormPage';
import CandidatePage from './pages/CandidatePage';
import CandidatesPage from './pages/CandidatesPage';
import ImportPage from './pages/ImportPage';
import LoginPage from './pages/LoginPage';
import NeedFormPage from './pages/NeedFormPage';
import NeedPage from './pages/NeedPage';
import NeedsPage from './pages/NeedsPage';
import type { Role } from './types';

const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  customer: [
    { to: '/needs', label: 'Мои потребности', end: true },
    { to: '/needs/new', label: 'Новая потребность' },
    { to: '/assistant', label: 'Ассистент' },
    { to: '/candidates', label: 'Кандидаты', end: true },
  ],
  pool_manager: [
    { to: '/pool', label: 'Бассейн кандидатов', end: true },
    { to: '/pool/new', label: 'Новый кандидат' },
    { to: '/pool/import', label: 'Импорт резюме' },
  ],
};

export default function App() {
  const { user, role, setRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return <LoginPage />;
  const home = role === 'customer' ? '/needs' : '/pool';

  return (
    <div className="layout">
      <header className="mobile-bar">
        <div className="brand"><span className="brand-mark">VH</span><span>ВендорХаб</span></div>
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>{menuOpen ? '✕ Закрыть' : '☰ Меню'}</button>
      </header>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">VH</span>
          <span>ВендорХаб</span>
        </div>
        {user.roles.length > 1 && (
          <div className="role-switch">
            {(user.roles as Role[]).filter((r) => r in ROLE_NAMES).map((r) => (
              <button key={r} className={r === role ? 'active' : ''} onClick={() => { setRole(r); navigate(r === 'customer' ? '/needs' : '/pool'); }}>
                {ROLE_NAMES[r]}
              </button>
            ))}
          </div>
        )}
        <nav>
          {NAV[role].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{user.full_name}</div>
          <div className="muted small">{ROLE_NAMES[role]} · {user.tribe_name}</div>
          <button className="link" onClick={logout}>Выйти</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          {role === 'customer' && (
            <>
              <Route path="/needs" element={<NeedsPage />} />
              <Route path="/needs/new" element={<NeedFormPage />} />
              <Route path="/needs/:id" element={<NeedPage />} />
              <Route path="/needs/:id/edit" element={<NeedFormPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/candidates" element={<CandidatesPage mode="customer" />} />
              <Route path="/candidates/:id" element={<CandidatePage />} />
            </>
          )}
          {role === 'pool_manager' && (
            <>
              <Route path="/pool" element={<CandidatesPage mode="manager" />} />
              <Route path="/pool/new" element={<CandidateFormPage />} />
              <Route path="/pool/import" element={<ImportPage />} />
              <Route path="/pool/:id" element={<CandidatePage />} />
              <Route path="/pool/:id/edit" element={<CandidateFormPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}
