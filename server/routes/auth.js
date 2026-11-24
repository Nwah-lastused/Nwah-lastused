// تسجيل حساب ودخول باسم مستخدم وكلمة مرور فقط — بلا بريد أو جوال أو رمز تحقق.
// Supabase Auth يتطلب بريدًا داخليًا، لذلك نشتق بريدًا تقنيًا غير مستخدم للتواصل:
//   <username>@AUTH_EMAIL_DOMAIN
// ويُنشأ الحساب مؤكَّدًا مباشرة عبر admin.createUser (يتطلب SUPABASE_SERVICE_ROLE_KEY على الخادم).
// الاسم واسم المستخدم يُحفظان في جدول profiles عبر trigger عند إنشاء المستخدم.
import express from 'express';
import { env } from '../config/env.js';
import { anonClient, adminClient, hasAdmin } from '../config/supabase.js';
import { requireSupabase, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { asyncHandler, ok, HttpError, badRequest, unwrap } from '../utils/http.js';
import { validateRegistration, validateLogin } from '../utils/validation.js';
import { getProfile } from '../services/dataService.js';

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

const emailFor = (username) => `${username}@${env.authEmailDomain}`;
const sessionOut = (s) => ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at });

async function usernameTaken(username) {
  const admin = await adminClient();
  if (!admin) return false; // بدون مفتاح الخادم نعتمد على قيد UNIQUE في قاعدة البيانات
  const row = unwrap(await admin.from('profiles').select('id').eq('username', username).maybeSingle());
  return Boolean(row);
}

router.post(
  '/register',
  requireSupabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const v = validateRegistration(req.body);
    if (!v.ok) throw badRequest('تحقق من بيانات التسجيل.', v.errors);
    const { full_name, username, password } = v.value;
    const taken = { username: 'اسم المستخدم محجوز، اختر اسمًا آخر.' };
    if (await usernameTaken(username)) throw new HttpError(409, 'اسم المستخدم مستخدم من قبل.', { code: 'username_taken', details: taken });

    const email = emailFor(username);
    const metadata = { full_name, username };
    const anon = await anonClient();

    if (hasAdmin()) {
      const admin = await adminClient();
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
      if (error) {
        if (/already|exists|registered|duplicate/i.test(error.message)) {
          throw new HttpError(409, 'اسم المستخدم مستخدم من قبل.', { code: 'username_taken', details: taken });
        }
        const e = new HttpError(502, 'تعذّر إنشاء الحساب حاليًا.', { code: 'auth_error' });
        e.cause = error;
        throw e;
      }
    } else {
      // بديل: يتطلب تعطيل «Confirm email» في إعدادات Supabase Auth.
      const { data, error } = await anon.auth.signUp({ email, password, options: { data: metadata } });
      if (error) {
        if (/already|registered/i.test(error.message)) throw new HttpError(409, 'اسم المستخدم مستخدم من قبل.', { code: 'username_taken', details: taken });
        const e = new HttpError(502, 'تعذّر إنشاء الحساب حاليًا.', { code: 'auth_error' });
        e.cause = error;
        throw e;
      }
      if (!data.session) {
        throw new HttpError(503, 'الخادم يحتاج SUPABASE_SERVICE_ROLE_KEY أو تعطيل «Confirm email» في Supabase لإنشاء حساب دون تحقق.', { code: 'auth_config' });
      }
    }

    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new HttpError(502, 'أُنشئ الحساب لكن تعذّر تسجيل الدخول تلقائيًا. جرّب الدخول يدويًا.', { code: 'auth_error' });
    ok(res, { user: { id: data.user.id, username, full_name }, session: sessionOut(data.session) }, 201);
  })
);

router.post(
  '/login',
  requireSupabase,
  authLimiter,
  asyncHandler(async (req, res) => {
    const v = validateLogin(req.body);
    if (!v.ok) throw badRequest('اكتب اسم المستخدم وكلمة المرور.', v.errors);
    const anon = await anonClient();
    const { data, error } = await anon.auth.signInWithPassword({ email: emailFor(v.value.username), password: v.value.password });
    if (error || !data.session) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.', { code: 'invalid_credentials' });
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
    if (!token) throw new HttpError(401, 'الجلسة منتهية.', { code: 'unauthorized' });
    const anon = await anonClient();
    const { data, error } = await anon.auth.refreshSession({ refresh_token: token });
    if (error || !data.session) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول مجددًا.', { code: 'unauthorized' });
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
    if (!p) throw new HttpError(401, 'الحساب غير مكتمل، سجّل الدخول مجددًا.', { code: 'unauthorized' });
    ok(res, { user: { id: p.id, username: p.username, full_name: p.full_name } });
  })
);

export default router;
