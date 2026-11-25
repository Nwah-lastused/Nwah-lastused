// Last Use server: static files, JSON API and Supabase integration.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { isSupabaseConfigured, hasAdmin } from './config/supabase.js';
import { securityHeaders, requestLang } from './middleware/security.js';
import { requireSupabase, requireAuth } from './middleware/auth.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import demoRoutes from './routes/demo.js';
import { notificationsRouter, remindersRouter } from './routes/notifications.js';
import { runForAllUsers } from './services/reminderService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(requestLang);
  app.use(express.json({ limit: '4mb' }));

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } }));
  api.get('/config', (req, res) =>
    res.json({
      ok: true,
      data: {
        mode: isSupabaseConfigured() ? 'supabase' : 'local',
        demoDataAllowed: env.allowDemoData,
        timezone: 'Asia/Riyadh',
        notificationChannels: { inApp: true, email: false, push: false }
      }
    })
  );
  api.use('/auth', authRoutes);
  api.use(requireSupabase, requireAuth);
  api.use('/dashboard', dashboardRoutes);
  api.use('/items', itemRoutes);
  api.use('/notifications', notificationsRouter);
  api.use('/reminders', remindersRouter);
  api.use('/settings', settingsRoutes);
  api.use('/demo', demoRoutes);

  app.use('/api', api);
  app.use('/api', apiNotFound);
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: env.isProduction ? '1h' : 0 }));
  app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.use(errorHandler);
  return app;
}

async function runReminderChecks(label) {
  try {
    console.log(`[reminders] ${label}:`, await runForAllUsers());
  } catch (e) {
    console.warn('[reminders] failed:', e.message);
  }
}

function startBackgroundJobs() {
  if (!isSupabaseConfigured()) {
    console.log('[mode] local demo (Supabase not configured)');
    return;
  }
  if (!hasAdmin()) {
    console.log('[mode] supabase without service role: background checks disabled');
    return;
  }
  runReminderChecks('startup');
  if (env.reminderIntervalMinutes > 0) {
    setInterval(() => runReminderChecks('interval'), env.reminderIntervalMinutes * 60_000).unref();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
    startBackgroundJobs();
  });
}
