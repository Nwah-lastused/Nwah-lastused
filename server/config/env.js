// تحميل متغيرات البيئة من .env (ميزة مدمجة في Node ≥ 20.12، بلا حزمة إضافية).
try {
  process.loadEnvFile?.();
} catch {
  /* لا يوجد ملف .env — نكمل بالمتغيرات الحالية */
}

const bool = (v, fallback) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: (process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
  // مفتاح سري للخادم فقط — لا يُرسل إلى المتصفح أبدًا.
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  authEmailDomain: (process.env.AUTH_EMAIL_DOMAIN || 'users.lastuse.local').trim(),
  storageBucket: (process.env.SUPABASE_STORAGE_BUCKET || 'item-images').trim(),
  reminderIntervalMinutes: Number(process.env.REMINDER_INTERVAL_MINUTES) || 0,
  trustProxy: bool(process.env.TRUST_PROXY, false)
};

env.isProduction = env.nodeEnv === 'production';
// البيانات التجريبية: مسموحة افتراضيًا في التطوير، وممنوعة في الإنتاج إلا بتفعيل صريح.
env.allowDemoData = bool(process.env.ALLOW_DEMO_DATA, !env.isProduction);
env.supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
