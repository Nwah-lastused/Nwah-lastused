import { HttpError } from '../utils/http.js';

export function apiNotFound(req, res) {
  res.status(404).json({ ok: false, error: { code: 'not_found', message: 'المسار غير موجود.' } });
}

// معالج أخطاء موحد: لا يكشف رسائل قاعدة البيانات أو أسرار الخادم للمستخدم.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') {
    err = new HttpError(413, 'حجم الطلب كبير جدًا (الحد الأقصى للصورة ٢ ميغابايت).', { code: 'too_large' });
  } else if (err?.type === 'entity.parse.failed') {
    err = new HttpError(400, 'صيغة JSON غير صالحة.', { code: 'bad_json' });
  }
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err?.cause || err);
  res.status(status).json({
    ok: false,
    error: {
      code: err instanceof HttpError ? err.code : 'server_error',
      message: err instanceof HttpError ? err.message : 'حدث خطأ في الخادم. حاول مجددًا لاحقًا.',
      details: err instanceof HttpError ? err.details : null
    }
  });
}
