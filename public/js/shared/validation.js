// Input validation shared by the browser and the server. Messages are localized via `lang`.
import { CATEGORY_VALUES, CONDITIONS, ITEM_STATUSES, IMAGE_RULES, DEFAULT_SETTINGS, ACTION_TYPES } from './constants.js';
import { isISODate, todayISO, toDateISO, dateInputToTimestamp } from './dates.js';
import { t, getLang } from './i18n.js';

const ITEM_FIELDS = [
  'name', 'category', 'category_other', 'purchase_date', 'expiry_date', 'last_used_at',
  'needs_replacement', 'replacement_interval', 'replacement_unit', 'alert_days_before',
  'unused_after_days', 'condition', 'notes', 'status'
];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const emptyToNull = (v) => (str(v) === '' ? null : v);

function intField(value, { min, max, labelKey }, errors, key, lang) {
  if (value === null || value === undefined || str(value) === '') return null;
  const n = Number(value);
  const label = t(labelKey, {}, lang);
  if (!Number.isInteger(n)) {
    errors[key] = t('v.int', { label }, lang);
    return null;
  }
  if (n < min || n > max) {
    errors[key] = t('v.range', { label, min, max }, lang);
    return null;
  }
  return n;
}

/** Validates a complete item (merge existing + patch before calling on update). */
export function validateItem(input, now = new Date(), lang = getLang()) {
  const errors = {};
  const v = {};
  const today = todayISO(now);
  const src = input || {};

  v.name = str(src.name);
  if (!v.name) errors.name = t('v.nameRequired', {}, lang);
  else if (v.name.length > 120) errors.name = t('v.nameLong', {}, lang);

  v.category = str(src.category) || 'other';
  if (!CATEGORY_VALUES.includes(v.category)) errors.category = t('v.category', {}, lang);
  v.category_other = v.category === 'other' ? emptyToNull(str(src.category_other)) : null;
  if (v.category_other && v.category_other.length > 40) errors.category_other = t('v.categoryOtherLong', {}, lang);

  for (const key of ['purchase_date', 'expiry_date']) {
    const raw = emptyToNull(str(src[key]));
    if (raw && !isISODate(raw)) errors[key] = t('v.dateFormat', {}, lang);
    v[key] = raw;
  }
  if (v.purchase_date && !errors.purchase_date && v.purchase_date > today) {
    errors.purchase_date = t('v.purchaseFuture', {}, lang);
  }
  if (v.purchase_date && v.expiry_date && !errors.expiry_date && v.expiry_date < v.purchase_date) {
    errors.expiry_date = t('v.expiryBeforePurchase', {}, lang);
  }

  const lastRaw = emptyToNull(str(src.last_used_at));
  v.last_used_at = null;
  if (lastRaw) {
    const ts = dateInputToTimestamp(lastRaw, now);
    if (!ts) errors.last_used_at = t('v.dateFormat', {}, lang);
    else {
      const d = toDateISO(ts);
      if (d > today) errors.last_used_at = t('v.lastUsedFuture', {}, lang);
      else if (v.purchase_date && d < v.purchase_date) errors.last_used_at = t('v.lastUsedBeforePurchase', {}, lang);
      v.last_used_at = ts;
    }
  }

  v.needs_replacement = src.needs_replacement === true || src.needs_replacement === 'true' || src.needs_replacement === 'on';
  if (v.needs_replacement) {
    v.replacement_unit = src.replacement_unit === 'months' ? 'months' : 'days';
    const max = v.replacement_unit === 'months' ? 120 : 3650;
    v.replacement_interval = intField(src.replacement_interval, { min: 1, max, labelKey: 'v.l.interval' }, errors, 'replacement_interval', lang);
    if (v.replacement_interval === null && !errors.replacement_interval) {
      errors.replacement_interval = t('v.intervalRequired', {}, lang);
    }
  } else {
    v.replacement_interval = null;
    v.replacement_unit = null;
  }

  v.alert_days_before = intField(src.alert_days_before, { min: 0, max: 365, labelKey: 'v.l.alertDays' }, errors, 'alert_days_before', lang);
  v.unused_after_days = intField(src.unused_after_days, { min: 1, max: 3650, labelKey: 'v.l.unusedDays' }, errors, 'unused_after_days', lang);

  v.condition = str(src.condition) || 'good';
  if (!CONDITIONS.includes(v.condition)) errors.condition = t('v.condition', {}, lang);

  v.notes = emptyToNull(str(src.notes));
  if (v.notes && v.notes.length > 1000) errors.notes = t('v.notesLong', {}, lang);

  v.status = str(src.status) || 'active';
  if (!ITEM_STATUSES.includes(v.status)) errors.status = t('v.status', {}, lang);

  for (const k of Object.keys(v)) if (!ITEM_FIELDS.includes(k)) delete v[k];
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

/** Validates an image data URL (declared type and decoded size). */
export function validateImageDataUrl(dataUrl, lang = getLang()) {
  const invalid = { ok: false, error: t('v.imageInvalid', {}, lang) };
  if (typeof dataUrl !== 'string') return invalid;
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return invalid;
  const mime = m[1];
  if (!IMAGE_RULES.mimeTypes.includes(mime)) return { ok: false, error: t('v.imageTypes', {}, lang) };
  const b64 = m[2];
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > IMAGE_RULES.maxBytes) return { ok: false, error: t('v.imageSize', {}, lang) };
  return { ok: true, mime, base64: b64, bytes };
}

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

export function normalizeUsername(u) {
  return str(u).toLowerCase();
}

export function validateRegistration(input, lang = getLang()) {
  const errors = {};
  const full_name = str(input?.full_name);
  const username = normalizeUsername(input?.username);
  const password = typeof input?.password === 'string' ? input.password : '';
  const confirm = typeof input?.password_confirm === 'string' ? input.password_confirm : password;

  if (full_name.length < 2) errors.full_name = t('v.fullName', {}, lang);
  else if (full_name.length > 60) errors.full_name = t('v.fullNameLong', {}, lang);
  if (!USERNAME_RE.test(username)) errors.username = t('v.username', {}, lang);
  if (password.length < 8) errors.password = t('v.passwordShort', {}, lang);
  else if (password.length > 72) errors.password = t('v.passwordLong', {}, lang);
  if (!errors.password && confirm !== password) errors.password_confirm = t('v.passwordMismatch', {}, lang);
  return { ok: !Object.keys(errors).length, errors, value: { full_name, username, password } };
}

export function validateLogin(input, lang = getLang()) {
  const errors = {};
  const username = normalizeUsername(input?.username);
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!username) errors.username = t('v.usernameRequired', {}, lang);
  if (!password) errors.password = t('v.passwordRequired', {}, lang);
  return { ok: !Object.keys(errors).length, errors, value: { username, password } };
}

export function validateSettings(input, lang = getLang()) {
  const errors = {};
  const v = {};
  const ranges = {
    unusedDays: [1, 3650],
    expiryAlertDays: [0, 365],
    replacementAlertDays: [0, 365],
    upcomingWindowDays: [1, 365]
  };
  for (const [k, [min, max]] of Object.entries(ranges)) {
    if (input?.[k] === undefined) continue;
    const labelKey = `v.l.${k}`;
    const n = intField(input[k], { min, max, labelKey }, errors, k, lang);
    if (n === null && !errors[k]) errors[k] = t('v.required', { label: t(labelKey, {}, lang) }, lang);
    v[k] = n;
  }
  if (input?.itemsView !== undefined) {
    if (!['cards', 'table'].includes(input.itemsView)) errors.itemsView = t('v.view', {}, lang);
    v.itemsView = input.itemsView;
  }
  for (const k of Object.keys(v)) if (!(k in DEFAULT_SETTINGS)) delete v[k];
  let full_name;
  if (input?.full_name !== undefined) {
    full_name = str(input.full_name);
    if (full_name.length < 2 || full_name.length > 60) errors.full_name = t('v.nameRange', {}, lang);
  }
  return { ok: !Object.keys(errors).length, errors, value: v, full_name };
}

export function validateAction(input, lang = getLang()) {
  const type = str(input?.action_type);
  const note = emptyToNull(str(input?.note));
  const errors = {};
  if (!ACTION_TYPES.includes(type)) errors.action_type = t('v.actionType', {}, lang);
  if (note && note.length > 500) errors.note = t('v.noteLong', {}, lang);
  return { ok: !Object.keys(errors).length, errors, value: { action_type: type, note } };
}

export function validateUsageNote(input, lang = getLang()) {
  const note = emptyToNull(str(input?.note));
  if (note && note.length > 500) return { ok: false, errors: { note: t('v.noteLong', {}, lang) } };
  return { ok: true, errors: {}, value: { note } };
}

export function validateNotificationPatch(input, lang = getLang()) {
  const status = str(input?.status);
  if (!['read', 'closed', 'new'].includes(status)) return { ok: false, errors: { status: t('v.notifStatus', {}, lang) } };
  return { ok: true, errors: {}, value: { status } };
}
