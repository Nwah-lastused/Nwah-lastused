// Uniform JSON responses and HTTP errors. Messages are resolved from the error code per request language.
export class HttpError extends Error {
  constructor(status, code = 'error', { details = null, message = code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (details = null, code = 'validation') => new HttpError(422, code, { details });
export const notFound = () => new HttpError(404, 'not_found');

export function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Maps Supabase / PostgREST errors to HTTP errors without leaking internals. */
export function fromDb(error) {
  if (!error) return null;
  if (error instanceof HttpError) return error;
  const code = error.code || '';
  if (code === 'PGRST116') return notFound();
  if (code === '23505') return new HttpError(409, 'conflict');
  if (['23514', '22P02', '22007'].includes(code)) return badRequest();
  if (code === '42501') return new HttpError(403, 'forbidden');
  const e = new HttpError(500, 'db_error');
  e.cause = error;
  return e;
}

export function unwrap({ data, error }) {
  if (error) throw fromDb(error);
  return data;
}
