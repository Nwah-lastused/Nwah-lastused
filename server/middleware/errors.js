import { HttpError } from '../utils/http.js';
import { t, hasKey } from '../../public/js/shared/i18n.js';

export function apiNotFound(req, res) {
  res.status(404).json({ ok: false, error: { code: 'not_found', message: t('errors.not_found', {}, req.lang) } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') err = new HttpError(413, 'too_large');
  else if (err?.type === 'entity.parse.failed') err = new HttpError(400, 'bad_json');

  const known = err instanceof HttpError;
  const status = known ? err.status : 500;
  const code = known ? err.code : 'server_error';
  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err?.cause || err);

  const key = `errors.${code}`;
  res.status(status).json({
    ok: false,
    error: {
      code,
      message: hasKey(key, req.lang) ? t(key, {}, req.lang) : t('errors.server_error', {}, req.lang),
      details: known ? err.details : null
    }
  });
}
