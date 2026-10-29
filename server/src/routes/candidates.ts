import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { all, get, json, likeParam, run } from '../db/index.js';
import { me, requireRole } from '../lib/auth.js';
import { normalizeLevel, normalizeRole, normalizeSkill, sameRole, sameSkill } from '../lib/dictionaries.js';
import { h, HttpError, idParam } from '../lib/http.js';
import { candidateOption, loadContext, mapCandidate, relevance } from '../services/matching.js';
import { loadNeed } from '../services/needs.js';
import { parseResume, pdfToText } from '../services/resumeParser.js';

export const candidatesRouter = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата в формате ГГГГ-ММ-ДД');
const review = z.object({ author: z.string().default(''), text: z.string().min(1), score: z.number().min(1).max(5).nullable().optional(), date: z.string().optional() });

const candidateSchema = z.object({
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  full_name: z.string().trim().default(''),
  age: z.number().int().min(14).max(100).nullable().optional(),
  role: z.string().trim().nullable().optional(),
  level: z.string().trim().nullable().optional(),
  skills: z.array(z.string()).default([]),
  rating: z.number().min(0).max(5).nullable().optional(),
  available_from: dateStr.nullable().optional(),
  available_to: dateStr.nullable().optional(),
  total_experience: z.number().min(0).max(60).nullable().optional(),
  uvb_status: z.enum(['not_checked', 'in_progress', 'passed', 'failed']).default('not_checked'),
  city: z.string().trim().nullable().optional(),
  rate: z.number().min(0).nullable().optional(),
  sber_experience: z.string().nullable().optional(),
  resume_experience: z.string().nullable().optional(),
  reviews: z.array(review).default([]),
  vendor_id: z.number().int().nullable().optional(),
}).superRefine((c, ctx) => {
  if (c.status === 'active') {
    if (!c.full_name) ctx.addIssue({ code: 'custom', path: ['full_name'], message: 'обязательно для активной карточки' });
    if (!c.role) ctx.addIssue({ code: 'custom', path: ['role'], message: 'обязательно для активной карточки' });
    if (!c.vendor_id) ctx.addIssue({ code: 'custom', path: ['vendor_id'], message: 'укажите подрядчика' });
  }
  if (c.available_from && c.available_to && c.available_to < c.available_from) {
    ctx.addIssue({ code: 'custom', path: ['available_to'], message: 'окончание раньше начала' });
  }
});

const SELECT = `SELECT c.*, v.name AS vendor_name, u.full_name AS created_by_name
  FROM candidates c LEFT JOIN vendors v ON v.id = c.vendor_id LEFT JOIN users u ON u.id = c.created_by`;

function readCandidate(id: number) {
  const row = get<any>(`${SELECT} WHERE c.id = ?`, id);
  if (!row) throw new HttpError(404, 'Кандидат не найден');
  const c: Record<string, any> & ReturnType<typeof mapCandidate> = mapCandidate(row);
  return { ...c, status: row.status as string, reviews: json.parse(row.reviews, []), resume_text: undefined, has_resume: !!row.resume_file };
}

const isManager = (roles: string[]) => roles.includes('pool_manager');

/** Позиция потребности для расчёта релевантности (только своя). */
function positionFor(positionId: unknown, userId: number) {
  if (!positionId) return null;
  const p = get<any>('SELECT * FROM need_positions WHERE id = ?', Number(positionId));
  if (!p) return null;
  const need = loadNeed(p.need_id);
  if (need.initiator_id !== userId) return null;
  return { need, position: { ...p, skills: json.parse<string[]>(p.skills, []) } };
}

candidatesRouter.get('/', h((req) => {
  const user = me(req);
  const q = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: any[] = [];
  const status = isManager(user.roles) ? q.status : 'active'; // заказчику — только активные карточки
  if (status) { where.push('c.status = ?'); params.push(status); }
  if (q.created_by) { where.push('c.created_by = ?'); params.push(Number(q.created_by)); }
  if (q.level) { where.push('c.level = ?'); params.push(q.level); }
  if (q.vendor_id) { where.push('c.vendor_id = ?'); params.push(Number(q.vendor_id)); }
  if (q.city) { where.push('c.city = ?'); params.push(q.city); }
  if (q.uvb_status) { where.push('c.uvb_status = ?'); params.push(q.uvb_status); }
  if (q.min_rating) { where.push('c.rating >= ?'); params.push(Number(q.min_rating)); }
  if (q.max_rate) { where.push('c.rate <= ?'); params.push(Number(q.max_rate)); }
  if (q.q) {
    where.push('(ulower(c.full_name) LIKE ? OR ulower(c.resume_experience) LIKE ? OR CAST(c.id AS TEXT) = ?)');
    params.push(likeParam(q.q), likeParam(q.q), q.q.replace(/^#/, ''));
  }
  // доступность: кандидат свободен на всём интервале
  if (q.available_from) { where.push('(c.available_from IS NULL OR c.available_from <= ?)'); params.push(q.available_from); }
  if (q.available_to) { where.push('(c.available_to IS NULL OR c.available_to >= ?)'); params.push(q.available_to); }

  let rows = all<any>(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updated_at DESC, c.id DESC`, ...params)
    .map((r) => ({ ...mapCandidate(r), created_by_name: r.created_by_name, updated_at: r.updated_at, status: r.status }));
  if (q.role) rows = rows.filter((r) => sameRole(r.role, q.role));
  const skills = (q.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (skills.length) rows = rows.filter((r) => skills.every((s) => r.skills.some((cs) => sameSkill(s, cs))));

  // Переход из визарда: релевантность и возможность привлечения относительно позиции
  const ctxPos = positionFor(q.positionId, user.id);
  if (ctxPos) {
    const ctx = loadContext(ctxPos.need.tribe_id);
    return rows
      .map((r) => {
        const option = candidateOption(ctx, ctxPos.position, r, { requireRole: false });
        return { ...r, relevance: option?.relevance ?? relevance(ctxPos.position, r), engagement: option ? { case: option.case, title: option.title, action: option.action, banner: option.banner } : null };
      })
      .sort((a, b) => b.relevance.score - a.relevance.score);
  }
  return rows;
}));

candidatesRouter.get('/:id', h((req) => {
  const user = me(req);
  const c = readCandidate(idParam(req));
  if (!isManager(user.roles) && c.status !== 'active') throw new HttpError(404, 'Кандидат не найден');
  const ctxPos = positionFor(req.query.positionId, user.id);
  if (ctxPos) {
    const option = candidateOption(loadContext(ctxPos.need.tribe_id), ctxPos.position, c, { requireRole: false });
    return { ...c, relevance: option?.relevance ?? relevance(ctxPos.position, c), engagement: option, position: ctxPos.position };
  }
  return c;
}));

function normalizeCandidate(data: z.infer<typeof candidateSchema>) {
  return {
    ...data,
    role: normalizeRole(data.role ?? null),
    level: normalizeLevel(data.level ?? null),
    skills: [...new Set(data.skills.map(normalizeSkill).filter(Boolean))],
  };
}

function saveCandidate(id: number | null, data: ReturnType<typeof normalizeCandidate>, userId: number, extra: { resume_file?: string; resume_text?: string } = {}) {
  const values = [
    data.status, data.full_name, data.age ?? null, data.role, data.level, json.str(data.skills), data.rating ?? null,
    data.available_from ?? null, data.available_to ?? null, data.total_experience ?? null, data.uvb_status, data.city ?? null,
    data.rate ?? null, data.sber_experience ?? null, data.resume_experience ?? null, json.str(data.reviews), data.vendor_id ?? null,
  ];
  if (id) {
    run(`UPDATE candidates SET status=?, full_name=?, age=?, role=?, level=?, skills=?, rating=?, available_from=?, available_to=?,
           total_experience=?, uvb_status=?, city=?, rate=?, sber_experience=?, resume_experience=?, reviews=?, vendor_id=?,
           updated_at=datetime('now') WHERE id=?`, ...values, id);
    return id;
  }
  return run(`INSERT INTO candidates (status, full_name, age, role, level, skills, rating, available_from, available_to,
           total_experience, uvb_status, city, rate, sber_experience, resume_experience, reviews, vendor_id, created_by, resume_file, resume_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ...values, userId, extra.resume_file ?? null, extra.resume_text ?? null).id;
}

candidatesRouter.post('/', requireRole('pool_manager'), h((req, res) => {
  const data = normalizeCandidate(candidateSchema.parse(req.body));
  const id = saveCandidate(null, data, me(req).id);
  res.status(201);
  return readCandidate(id);
}));

candidatesRouter.put('/:id', requireRole('pool_manager'), h((req) => {
  const id = idParam(req);
  readCandidate(id);
  const data = normalizeCandidate(candidateSchema.parse(req.body));
  saveCandidate(id, data, me(req).id);
  return readCandidate(id);
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 50 },
});

/** Импорт и распознавание резюме (PDF): по каждому файлу — статус обработки и ссылка на карточку в статусе «Черновик». */
candidatesRouter.post('/import', requireRole('pool_manager'), upload.array('files', 50), h(async (req) => {
  const user = me(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, 'Не выбраны файлы');
  const vendorId = req.body.vendor_id ? Number(req.body.vendor_id) : null;
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const results = [];
  for (const file of files) {
    // multer отдаёт имя в latin1
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    try {
      const isPdf = file.mimetype === 'application/pdf' || name.toLowerCase().endsWith('.pdf') || file.buffer.subarray(0, 5).toString() === '%PDF-';
      if (!isPdf) throw new Error('Файл не является PDF');
      const text = await pdfToText(file.buffer);
      if (text.replace(/\s/g, '').length < 30) throw new Error('В PDF нет текстового слоя (скан) — распознавание недоступно');
      const parsed = await parseResume(text);
      const stored = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
      fs.writeFileSync(path.join(config.uploadDir, stored), file.buffer);
      const id = saveCandidate(null, normalizeCandidate(candidateSchema.parse({
        status: 'draft',
        full_name: parsed.full_name ?? '',
        age: parsed.age, city: parsed.city, role: parsed.role, level: parsed.level, skills: parsed.skills,
        total_experience: parsed.total_experience, rate: parsed.rate,
        sber_experience: parsed.sber_experience, resume_experience: parsed.resume_experience, vendor_id: vendorId,
      })), user.id, { resume_file: stored, resume_text: text });
      results.push({ file: name, status: 'ok', id, full_name: parsed.full_name, missing: parsed.missing });
    } catch (e) {
      results.push({ file: name, status: 'error', error: (e as Error).message });
    }
  }
  return { results };
}));

candidatesRouter.get('/:id/resume', h((req, res) => {
  const row = get<any>('SELECT resume_file, full_name, status FROM candidates WHERE id = ?', idParam(req));
  if (!row?.resume_file) throw new HttpError(404, 'Файл резюме не загружен');
  if (!isManager(me(req).roles) && row.status !== 'active') throw new HttpError(404, 'Файл резюме не загружен');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent((row.full_name || 'resume') + '.pdf')}`);
  res.sendFile(path.join(config.uploadDir, row.resume_file));
}));
