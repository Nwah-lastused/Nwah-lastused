// Supabase clients.
// anon:  sign-in and token refresh.
// user:  carries the user's JWT so Row Level Security applies to every query.
// admin: service-role client for account creation and scheduled checks (server only).
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

/** Test hook: inject an alternative client factory. */
export function __setCreateClient(fn) {
  createClientFn = fn;
  admin = null;
}
