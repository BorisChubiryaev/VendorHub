import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get, json } from '../db/index.js';
import type { SessionUser } from '../services/needs.js';
import { HttpError } from './http.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export function loadUser(where: 'id' | 'login', value: number | string): (SessionUser & { password_hash: string }) | null {
  const row = get<any>(
    `SELECT u.*, t.name AS tribe_name FROM users u LEFT JOIN tribes t ON t.id = u.tribe_id WHERE u.${where} = ?`, value,
  );
  return row ? { ...row, roles: json.parse<string[]>(row.roles, []) } : null;
}

export const publicUser = (u: SessionUser & { password_hash?: string }) => ({
  id: u.id, login: u.login, full_name: u.full_name, roles: u.roles, tribe_id: u.tribe_id, tribe_name: u.tribe_name,
});

/** Локальная авторизация по логину и паролю (без СУДИР). */
export function login(loginName: string, password: string) {
  const user = loadUser('login', loginName.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, 'Неверный логин или пароль');
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtTtl as jwt.SignOptions['expiresIn'] });
  return { token, user: publicUser(user) };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
  if (!token) return next(new HttpError(401, 'Требуется авторизация'));
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as { sub: number };
    const user = loadUser('id', payload.sub);
    if (!user) return next(new HttpError(401, 'Пользователь не найден'));
    req.user = publicUser(user);
    next();
  } catch {
    next(new HttpError(401, 'Сессия истекла, войдите заново'));
  }
}

export const requireRole = (...roles: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !roles.some((r) => req.user!.roles.includes(r))) return next(new HttpError(403, 'Недостаточно прав для этого действия'));
  next();
};

export const me = (req: Request) => {
  if (!req.user) throw new HttpError(401, 'Требуется авторизация');
  return req.user;
};
