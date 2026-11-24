// استجابات JSON موحدة وأخطاء HTTP.
export class HttpError extends Error {
  constructor(status, message, { code = 'error', details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(422, msg, { code: 'validation', details });
export const notFound = (msg = 'غير موجود.') => new HttpError(404, msg, { code: 'not_found' });

export function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** يحوّل أخطاء Supabase/PostgREST إلى أخطاء HTTP مفهومة دون كشف التفاصيل الداخلية. */
export function fromDb(error, fallback = 'تعذّر تنفيذ العملية على قاعدة البيانات.') {
  if (!error) return null;
  if (error instanceof HttpError) return error;
  const code = error.code || '';
  if (code === 'PGRST116') return notFound();
  if (code === '23505') return new HttpError(409, 'السجل موجود مسبقًا.', { code: 'conflict' });
  if (code === '23514' || code === '22P02' || code === '22007') return badRequest('قيمة غير صالحة.');
  if (code === '42501') return new HttpError(403, 'لا تملك صلاحية لهذه العملية.', { code: 'forbidden' });
  const e = new HttpError(500, fallback, { code: 'db_error' });
  e.cause = error;
  return e;
}

/** يرمي الخطأ إن وُجد ويعيد البيانات. */
export function unwrap({ data, error }, fallback) {
  if (error) throw fromDb(error, fallback);
  return data;
}
