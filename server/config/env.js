// Environment configuration.
try {
  process.loadEnvFile?.();
} catch {
  /* no .env file */
}

const bool = (v, fallback) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: (process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  authEmailDomain: (process.env.AUTH_EMAIL_DOMAIN || 'users.lastuse.local').trim(),
  storageBucket: (process.env.SUPABASE_STORAGE_BUCKET || 'item-images').trim(),
  reminderIntervalMinutes: Number(process.env.REMINDER_INTERVAL_MINUTES) || 0,
  trustProxy: bool(process.env.TRUST_PROXY, false)
};

env.isProduction = env.nodeEnv === 'production';
env.allowDemoData = bool(process.env.ALLOW_DEMO_DATA, !env.isProduction);
env.supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
