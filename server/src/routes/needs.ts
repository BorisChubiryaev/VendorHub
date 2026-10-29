import { Router } from 'express';
import { z } from 'zod';
import { me, requireRole } from '../lib/auth.js';
import { h, HttpError, idParam } from '../lib/http.js';
import * as needs from '../services/needs.js';

export const needsRouter = Router();
needsRouter.use(requireRole('customer'));

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const needSchema = z.object({
  product: z.string().trim().max(200).default(''),
  backlog_key: z.string().trim().nullable().optional(),
  backlog_url: z.string().trim().nullable().optional(),
  requirements_summary: z.string().max(5000).nullable().optional(),
  positions: z.array(z.object({
    role: z.string().trim().min(1, 'укажите роль'),
    level: z.string().nullable().optional(),
    quantity: z.number().int().min(1).max(50).default(1),
    skills: z.array(z.string()).default([]),
    start_date: dateStr,
    end_date: dateStr,
    interview_required: z.boolean().optional(),
  })).default([]),
  submit: z.boolean().optional(),
});
const idsSchema = z.object({ ids: z.array(z.number().int()).min(1, 'выберите позиции') });

needsRouter.get('/', h((req) => needs.listNeeds(me(req), req.query as Record<string, string>)));

needsRouter.post('/', h((req, res) => {
  const user = me(req);
  const { submit, ...data } = needSchema.parse(req.body);
  if (submit) {
    // проверяем до создания, чтобы не плодить черновики при ошибке
    const errors = needs.validateForSubmit({ ...data, backlog_key: data.backlog_key ?? null, requirements_summary: data.requirements_summary ?? null } as any);
    if (errors.length) throw new HttpError(400, errors.join('; '), { errors });
  }
  const id = needs.createNeed(user, data);
  if (submit) needs.submitNeed(id, user);
  res.status(201);
  return needs.loadNeed(id);
}));

needsRouter.get('/:id', h((req) => needs.needForUser(idParam(req), me(req))));

needsRouter.put('/:id', h((req) => {
  const user = me(req);
  const id = idParam(req);
  const { submit, ...data } = needSchema.parse(req.body);
  needs.updateDraft(id, user, data);
  if (submit) needs.submitNeed(id, user);
  return needs.loadNeed(id);
}));

needsRouter.post('/:id/submit', h((req) => { needs.submitNeed(idParam(req), me(req)); return needs.loadNeed(idParam(req)); }));
needsRouter.post('/:id/cancel', h((req) => { needs.cancelNeed(idParam(req), me(req)); return needs.loadNeed(idParam(req)); }));
needsRouter.get('/:id/wizard', h((req) => needs.wizard(idParam(req), me(req))));

needsRouter.post('/:id/scenario', h((req) => {
  const { scenario } = z.object({ scenario: z.enum(['best', 'fast', 'cheap']) }).parse(req.body);
  needs.applyScenario(idParam(req), me(req), scenario);
  return needs.wizard(idParam(req), me(req));
}));

needsRouter.post('/:id/positions/delete', h((req) => {
  needs.deletePositions(idParam(req), me(req), idsSchema.parse(req.body).ids);
  return needs.wizard(idParam(req), me(req));
}));

needsRouter.post('/:id/positions/launch', h((req) => {
  needs.launchRoute(idParam(req), me(req), idsSchema.parse(req.body).ids);
  return needs.wizard(idParam(req), me(req));
}));

needsRouter.post('/:id/split', h((req) => ({ id: needs.splitNeed(idParam(req), me(req), idsSchema.parse(req.body).ids) })));

needsRouter.post('/:id/hq', h((req) => {
  needs.sendToHq(idParam(req), me(req));
  return needs.wizard(idParam(req), me(req));
}));

export const positionsRouter = Router();
positionsRouter.use(requireRole('customer'));

positionsRouter.get('/:id', h((req) => {
  const { need, position } = needs.positionOf(idParam(req), me(req));
  return { ...position, need_product: need.product, need_status: need.status };
}));

positionsRouter.patch('/:id', h((req) => {
  const body = z.object({ interview_required: z.boolean().optional(), option: z.string().optional() }).parse(req.body);
  const id = idParam(req);
  if (body.interview_required !== undefined) needs.setInterview(id, me(req), body.interview_required);
  if (body.option) needs.selectOption(id, me(req), body.option);
  return { ok: true };
}));

/** Эмулятор ответа внешней системы по активному шагу маршрута (для стенда ИФТ без интеграций). */
positionsRouter.post('/:id/advance', h((req) => {
  const { outcome } = z.object({ outcome: z.enum(['success', 'fail']) }).parse(req.body);
  return { status: needs.advanceAsUser(idParam(req), me(req), outcome) };
}));
