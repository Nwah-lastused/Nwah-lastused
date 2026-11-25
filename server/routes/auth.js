// Username + password accounts without email or phone verification.
// Supabase Auth requires an email, so a technical address <username>@AUTH_EMAIL_DOMAIN is derived
// and the account is created pre-confirmed via the admin API. Name and username live in `profiles`.
import express from 'express';
import { env } from '../config/env.js';
import { anonClient, adminClient, hasAdmin } from '../config/supabase.js';
import { requireSupabase, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { asyncHandler, ok, HttpError, badRequest, unwrap } from '../utils/http.js';
import { validateRegistration, validateLogin } from '../utils/validation.js';
import { getProfile } from '../services/dataService.js';
import { t } from '../../public/js/shared/i18n.js';

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

const emailFor = (username) => `${username}@${env.authEmailDomain}`;
const sessionOut = (s) => ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at });
const usernameTaken = (lang) => new HttpError(409, 'username_taken', { details: { username: t('v.usernameTaken', {}, lang) } });

function authFailure(error) {
  const e = new HttpError(502, 'auth_error');
  e.cause = error;
  return e;
}

async function isUsernameTaken(username) {
  const admin = await adminClient();
  if (!admin) return false;
  return Boolean(unwrap(await admin.from('profiles').select('id').eq('username', username).maybeSingle()));
}

router.post(
  '/register',
  requireSupabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const v = validateRegistration(req.body, req.lang);
    if (!v.ok) throw badRequest(v.errors);
    const { full_name, username, password } = v.value;
    if (await isUsernameTaken(username)) throw usernameTaken(req.lang);

    const email = emailFor(username);
    const metadata = { full_name, username };
    const anon = await anonClient();

    if (hasAdmin()) {
      const admin = await adminClient();
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
      if (error) throw /already|exists|registered|duplicate/i.test(error.message) ? usernameTaken(req.lang) : authFailure(error);
    } else {
      // Requires "Confirm email" to be disabled in Supabase Auth settings.
      const { data, error } = await anon.auth.signUp({ email, password, options: { data: metadata } });
      if (error) throw /already|registered/i.test(error.message) ? usernameTaken(req.lang) : authFailure(error);
      if (!data.session) throw new HttpError(503, 'auth_config');
    }

    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw authFailure(error);
    ok(res, { user: { id: data.user.id, username, full_name }, session: sessionOut(data.session) }, 201);
  })
);

router.post(
  '/login',
  requireSupabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const v = validateLogin(req.body, req.lang);
    if (!v.ok) throw badRequest(v.errors);
    const anon = await anonClient();
    const { data, error } = await anon.auth.signInWithPassword({ email: emailFor(v.value.username), password: v.value.password });
    if (error || !data.session) throw new HttpError(401, 'invalid_credentials');
    const meta = data.user.user_metadata || {};
    ok(res, {
      user: { id: data.user.id, username: meta.username || v.value.username, full_name: meta.full_name || v.value.username },
      session: sessionOut(data.session)
    });
  })
);

router.post(
  '/refresh',
  requireSupabase,
  rateLimit({ windowMs: 60_000, max: 30 }),
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
    if (!token) throw new HttpError(401, 'unauthorized');
    const anon = await anonClient();
    const { data, error } = await anon.auth.refreshSession({ refresh_token: token });
    if (error || !data.session) throw new HttpError(401, 'unauthorized');
    ok(res, { session: sessionOut(data.session) });
  })
);

router.post(
  '/logout',
  requireSupabase,
  requireAuth,
  asyncHandler(async (req, res) => {
    const admin = await adminClient();
    if (admin) await admin.auth.admin.signOut(req.accessToken).catch(() => {});
    ok(res, { signedOut: true });
  })
);

router.get(
  '/me',
  requireSupabase,
  requireAuth,
  asyncHandler(async (req, res) => {
    const p = await getProfile(req.db, req.user.id);
    if (!p) throw new HttpError(401, 'unauthorized');
    ok(res, { user: { id: p.id, username: p.username, full_name: p.full_name } });
  })
);

export default router;
