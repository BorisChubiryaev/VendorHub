import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { requireAuth } from './lib/auth.js';
import { errorHandler, HttpError } from './lib/http.js';
import { candidatesRouter } from './routes/candidates.js';
import { assistantRouter, authRouter, backlogRouter, dictionariesRouter, integrationsRouter } from './routes/misc.js';
import { needsRouter, positionsRouter } from './routes/needs.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/dictionaries', requireAuth, dictionariesRouter);
  app.use('/api/candidates', requireAuth, candidatesRouter);
  app.use('/api/needs', requireAuth, needsRouter);
  app.use('/api/positions', requireAuth, positionsRouter);
  app.use('/api/backlog', requireAuth, backlogRouter);
  app.use('/api/assistant', requireAuth, assistantRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Метод API не найден')));

  // Собранный фронтенд (SPA)
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
