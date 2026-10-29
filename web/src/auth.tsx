import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { Dictionaries, Role, User } from './types';

interface AuthState {
  user: User | null;
  dict: Dictionaries | null;
  role: Role;
  setRole: (r: Role) => void;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState>(null!);
const ROLE_KEY = 'vh_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dict, setDict] = useState<Dictionaries | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRoleState] = useState<Role>((localStorage.getItem(ROLE_KEY) as Role) || 'customer');

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setDict(null);
  }, []);

  const bootstrap = useCallback(async () => {
    const [me, d] = await Promise.all([api<User>('/auth/me'), api<Dictionaries>('/dictionaries')]);
    setUser(me);
    setDict(d);
    setRoleState((current) => (me.roles.includes(current) ? current : (me.roles[0] as Role)));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (tokenStore.get()) bootstrap().catch(logout).finally(() => setReady(true));
    else setReady(true);
  }, [bootstrap, logout]);

  const login = async (loginName: string, password: string) => {
    const r = await api<{ token: string }>('/auth/login', { method: 'POST', json: { login: loginName, password } });
    tokenStore.set(r.token);
    await bootstrap();
  };

  const setRole = (r: Role) => {
    localStorage.setItem(ROLE_KEY, r);
    setRoleState(r);
  };

  if (!ready) return <div className="splash">Загрузка…</div>;
  return <Ctx.Provider value={{ user, dict, role, setRole, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const useDict = () => useContext(Ctx).dict!;

export const ROLE_NAMES: Record<Role, string> = { customer: 'Заказчик ИТ-ресурсов', pool_manager: 'Менеджер бассейна' };
