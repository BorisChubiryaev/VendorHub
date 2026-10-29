import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Обёртка для async-обработчиков (Express 5 сам ловит промисы, но так явнее и типобезопаснее). */
export const h = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).then((r) => {
    if (r !== undefined && !res.headersSent) res.json(r);
  }, next);

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Некорректные данные: ' + err.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ') });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл слишком большой' });
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

export const idParam = (req: Request, name = 'id') => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Некорректный идентификатор');
  return id;
};
