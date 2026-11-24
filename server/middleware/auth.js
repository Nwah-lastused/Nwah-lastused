// المصادقة: معرّف المستخدم يُؤخذ دائمًا من الجلسة (JWT من Supabase Auth) ولا يُقبل من جسم الطلب.
import { isSupabaseConfigured, anonClient, userClient } from '../config/supabase.js';
import { HttpError } from '../utils/http.js';

export function requireSupabase(req, res, next) {
  if (!isSupabaseConfigured()) {
    return next(
      new HttpError(503, 'Supabase غير مُعد على الخادم؛ المنصة تعمل حاليًا في الوضع التجريبي المحلي داخل المتصفح.', {
        code: 'supabase_not_configured'
      })
    );
  }
  next();
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'يجب تسجيل الدخول.', { code: 'unauthorized' });
    const anon = await anonClient();
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول مجددًا.', { code: 'unauthorized' });
    req.user = { id: data.user.id };
    req.accessToken = token;
    // عميل بصلاحيات المستخدم: سياسات RLS تمنع الوصول لبيانات غيره حتى لو أخطأ الكود.
    req.db = await userClient(token);
    next();
  } catch (e) {
    next(e);
  }
}
