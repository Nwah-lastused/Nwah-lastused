// عملاء Supabase للخادم.
// - anon: لتسجيل الدخول وتجديد الجلسة.
// - user: عميل بصلاحيات المستخدم (JWT) فتطبَّق سياسات RLS على كل استعلام.
// - admin: بمفتاح service_role لإنشاء الحسابات دون تحقق بريد، وللفحص الدوري لكل المستخدمين. للخادم فقط.
import { env } from './env.js';

let createClientFn = null;

async function loadSdk() {
  if (!createClientFn) {
    const mod = await import('@supabase/supabase-js');
    createClientFn = mod.createClient;
  }
  return createClientFn;
}

const baseOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const isSupabaseConfigured = () => env.supabaseConfigured;
export const hasAdmin = () => env.supabaseConfigured && Boolean(env.supabaseServiceRoleKey);

export async function anonClient() {
  const createClient = await loadSdk();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, baseOptions);
}

export async function userClient(accessToken) {
  const createClient = await loadSdk();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

let admin = null;
export async function adminClient() {
  if (!hasAdmin()) return null;
  if (!admin) {
    const createClient = await loadSdk();
    admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, baseOptions);
  }
  return admin;
}

/** للاختبارات: حقن مُنشئ عملاء بديل. */
export function __setCreateClient(fn) {
  createClientFn = fn;
  admin = null;
}
