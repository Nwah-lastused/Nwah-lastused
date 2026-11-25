// Server validation reuses the shared rules used by the browser.
export {
  validateItem,
  validateImageDataUrl,
  validateRegistration,
  validateLogin,
  validateSettings,
  validateAction,
  validateUsageNote,
  validateNotificationPatch,
  normalizeUsername,
  USERNAME_RE
} from '../../public/js/shared/validation.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export function validateIdParam(req, res, next) {
  if (!isUuid(req.params.id)) {
    return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Not found' } });
  }
  next();
}

export function queryString(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
