// خادم «آخر استخدام»: ملفات ثابتة + واجهات API + ربط Supabase.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { isSupabaseConfigured, hasAdmin } from './config/supabase.js';
import { securityHeaders } from './middleware/security.js';
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
  app.use(express.json({ limit: '4mb' })); // الصور تصل base64 (حدها الفعلي ٢ ميغابايت يُتحقق منه لاحقًا)

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } }));
  // إعدادات عامة للواجهة — لا تحتوي أي مفتاح.
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
  api.use(requireSupabase, requireAuth); // كل ما يلي يتطلب Supabase وجلسة صالحة
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

async function startupChecks() {
  if (!isSupabaseConfigured()) {
    console.log('ℹ️  Supabase غير مُعد: الواجهة تعمل في الوضع التجريبي المحلي (localStorage).');
    return;
  }
  if (!hasAdmin()) {
    console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY غير موجود: إنشاء الحسابات يتطلب تعطيل «Confirm email»، والفحص الشامل عند البدء متوقف.');
    return;
  }
  const run = async (label) => {
    try {
      const r = await runForAllUsers();
      console.log(`🔔 فحص التذكيرات (${label}):`, r);
    } catch (e) {
      console.warn('⚠️  فشل فحص التذكيرات:', e.message);
    }
  };
  await run('عند البدء');
  if (env.reminderIntervalMinutes > 0) {
    setInterval(() => run('دوري'), env.reminderIntervalMinutes * 60_000).unref();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(env.port, () => {
    console.log(`✅ «آخر استخدام» يعمل على http://localhost:${env.port}  (الوضع: ${isSupabaseConfigured() ? 'Supabase' : 'محلي تجريبي'})`);
    startupChecks();
  });
}
