// تحقق مشترك من المدخلات (الواجهة والخادم)، مع رسائل عربية.
import { CATEGORY_VALUES, CONDITIONS, ITEM_STATUSES, IMAGE_RULES, DEFAULT_SETTINGS, ACTION_TYPES } from './constants.js';
import { isISODate, todayISO, toDateISO, dateInputToTimestamp } from './dates.js';

const ITEM_FIELDS = [
  'name', 'category', 'category_other', 'purchase_date', 'expiry_date', 'last_used_at',
  'needs_replacement', 'replacement_interval', 'replacement_unit', 'alert_days_before',
  'unused_after_days', 'condition', 'notes', 'status'
];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const emptyToNull = (v) => (str(v) === '' ? null : v);

function intField(value, { min, max, label }, errors, key) {
  if (value === null || value === undefined || str(value) === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    errors[key] = `قيمة «${label}» يجب أن تكون عددًا صحيحًا.`;
    return null;
  }
  if (n < min || n > max) {
    errors[key] = `قيمة «${label}» يجب أن تكون بين ${min} و${max}.`;
    return null;
  }
  return n;
}

/**
 * يتحقق من غرض كامل (عند التعديل: يُدمج القديم مع الجديد قبل الاستدعاء).
 * يعيد { ok, errors, value } حيث value يحوي الحقول المسموحة فقط بعد التنظيف.
 */
export function validateItem(input, now = new Date()) {
  const errors = {};
  const v = {};
  const today = todayISO(now);
  const src = input || {};

  v.name = str(src.name);
  if (!v.name) errors.name = 'اسم الغرض مطلوب.';
  else if (v.name.length > 120) errors.name = 'اسم الغرض طويل جدًا (الحد ١٢٠ حرفًا).';

  v.category = str(src.category) || 'other';
  if (!CATEGORY_VALUES.includes(v.category)) errors.category = 'اختر تصنيفًا من القائمة.';
  v.category_other = v.category === 'other' ? emptyToNull(str(src.category_other)) : null;
  if (v.category_other && v.category_other.length > 40) errors.category_other = 'اسم التصنيف طويل جدًا (الحد ٤٠ حرفًا).';

  for (const key of ['purchase_date', 'expiry_date']) {
    const raw = emptyToNull(str(src[key]));
    if (raw && !isISODate(raw)) errors[key] = 'صيغة التاريخ غير صحيحة.';
    v[key] = raw;
  }
  if (v.purchase_date && !errors.purchase_date && v.purchase_date > today) {
    errors.purchase_date = 'تاريخ الشراء لا يمكن أن يكون في المستقبل.';
  }
  if (v.purchase_date && v.expiry_date && !errors.expiry_date && v.expiry_date < v.purchase_date) {
    errors.expiry_date = 'تاريخ انتهاء الصلاحية لا يمكن أن يسبق تاريخ الشراء.';
  }

  const lastRaw = emptyToNull(str(src.last_used_at));
  v.last_used_at = null;
  if (lastRaw) {
    const ts = dateInputToTimestamp(lastRaw, now);
    if (!ts) errors.last_used_at = 'صيغة تاريخ آخر استخدام غير صحيحة.';
    else {
      const d = toDateISO(ts);
      if (d > today) errors.last_used_at = 'تاريخ آخر استخدام لا يمكن أن يكون في المستقبل.';
      else if (v.purchase_date && d < v.purchase_date) errors.last_used_at = 'تاريخ آخر استخدام لا يمكن أن يسبق تاريخ الشراء.';
      v.last_used_at = ts;
    }
  }

  v.needs_replacement = src.needs_replacement === true || src.needs_replacement === 'true' || src.needs_replacement === 'on';
  if (v.needs_replacement) {
    v.replacement_unit = src.replacement_unit === 'months' ? 'months' : 'days';
    const max = v.replacement_unit === 'months' ? 120 : 3650;
    v.replacement_interval = intField(src.replacement_interval, { min: 1, max, label: 'مدة التكرار' }, errors, 'replacement_interval');
    if (v.replacement_interval === null && !errors.replacement_interval) {
      errors.replacement_interval = 'حدّد مدة التكرار للاستبدال الدوري.';
    }
  } else {
    v.replacement_interval = null;
    v.replacement_unit = null;
  }

  v.alert_days_before = intField(src.alert_days_before, { min: 0, max: 365, label: 'أيام التنبيه' }, errors, 'alert_days_before');
  v.unused_after_days = intField(src.unused_after_days, { min: 1, max: 3650, label: 'مهلة قلة الاستخدام' }, errors, 'unused_after_days');

  v.condition = str(src.condition) || 'good';
  if (!CONDITIONS[v.condition]) errors.condition = 'حالة الغرض غير معروفة.';

  v.notes = emptyToNull(str(src.notes));
  if (v.notes && v.notes.length > 1000) errors.notes = 'الملاحظات طويلة جدًا (الحد ١٠٠٠ حرف).';

  v.status = str(src.status) || 'active';
  if (!ITEM_STATUSES[v.status]) errors.status = 'حالة غير صالحة.';

  for (const k of Object.keys(v)) if (!ITEM_FIELDS.includes(k)) delete v[k];
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

/** يتحقق من صورة بصيغة data URL: النوع والحجم. */
export function validateImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { ok: false, error: 'ملف الصورة غير صالح.' };
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: 'ملف الصورة غير صالح.' };
  const mime = m[1];
  if (!IMAGE_RULES.mimeTypes.includes(mime)) return { ok: false, error: 'الصيغ المسموحة: JPG أو PNG أو WEBP.' };
  const b64 = m[2];
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > IMAGE_RULES.maxBytes) return { ok: false, error: 'حجم الصورة أكبر من ٢ ميغابايت.' };
  return { ok: true, mime, base64: b64, bytes };
}

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

export function normalizeUsername(u) {
  return str(u).toLowerCase();
}

export function validateRegistration(input) {
  const errors = {};
  const full_name = str(input?.full_name);
  const username = normalizeUsername(input?.username);
  const password = typeof input?.password === 'string' ? input.password : '';
  const confirm = typeof input?.password_confirm === 'string' ? input.password_confirm : password;

  if (full_name.length < 2) errors.full_name = 'اكتب اسمك (حرفان على الأقل).';
  else if (full_name.length > 60) errors.full_name = 'الاسم طويل جدًا (الحد ٦٠ حرفًا).';
  if (!USERNAME_RE.test(username)) {
    errors.username = 'اسم المستخدم من ٣ إلى ٣٠ حرفًا: حروف إنجليزية صغيرة أو أرقام أو _ أو نقطة.';
  }
  if (password.length < 8) errors.password = 'كلمة المرور ٨ أحرف على الأقل.';
  else if (password.length > 72) errors.password = 'كلمة المرور طويلة جدًا (الحد ٧٢ حرفًا).';
  if (!errors.password && confirm !== password) errors.password_confirm = 'كلمتا المرور غير متطابقتين.';
  return { ok: !Object.keys(errors).length, errors, value: { full_name, username, password } };
}

export function validateLogin(input) {
  const errors = {};
  const username = normalizeUsername(input?.username);
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!username) errors.username = 'اكتب اسم المستخدم.';
  if (!password) errors.password = 'اكتب كلمة المرور.';
  return { ok: !Object.keys(errors).length, errors, value: { username, password } };
}

export function validateSettings(input) {
  const errors = {};
  const v = {};
  const ranges = {
    unusedDays: [1, 3650, 'مهلة قلة الاستخدام'],
    expiryAlertDays: [0, 365, 'مهلة تنبيه انتهاء الصلاحية'],
    replacementAlertDays: [0, 365, 'مهلة تنبيه الاستبدال'],
    upcomingWindowDays: [1, 365, 'نافذة الأغراض القريبة']
  };
  for (const [k, [min, max, label]] of Object.entries(ranges)) {
    if (input?.[k] === undefined) continue;
    const n = intField(input[k], { min, max, label }, errors, k);
    if (n === null && !errors[k]) errors[k] = `قيمة «${label}» مطلوبة.`;
    v[k] = n;
  }
  if (input?.itemsView !== undefined) {
    if (!['cards', 'table'].includes(input.itemsView)) errors.itemsView = 'طريقة عرض غير معروفة.';
    v.itemsView = input.itemsView;
  }
  for (const k of Object.keys(v)) if (!(k in DEFAULT_SETTINGS)) delete v[k];
  let full_name;
  if (input?.full_name !== undefined) {
    full_name = str(input.full_name);
    if (full_name.length < 2 || full_name.length > 60) errors.full_name = 'الاسم بين ٢ و٦٠ حرفًا.';
  }
  return { ok: !Object.keys(errors).length, errors, value: v, full_name };
}

export function validateAction(input) {
  const type = str(input?.action_type);
  const note = emptyToNull(str(input?.note));
  const errors = {};
  if (!ACTION_TYPES.includes(type)) errors.action_type = 'نوع القرار غير معروف.';
  if (note && note.length > 500) errors.note = 'الملاحظة طويلة جدًا (الحد ٥٠٠ حرف).';
  return { ok: !Object.keys(errors).length, errors, value: { action_type: type, note } };
}

export function validateUsageNote(input) {
  const note = emptyToNull(str(input?.note));
  if (note && note.length > 500) return { ok: false, errors: { note: 'الملاحظة طويلة جدًا (الحد ٥٠٠ حرف).' } };
  return { ok: true, errors: {}, value: { note } };
}

export function validateNotificationPatch(input) {
  const status = str(input?.status);
  if (!['read', 'closed', 'new'].includes(status)) {
    return { ok: false, errors: { status: 'الحالة يجب أن تكون مقروء أو مغلق.' } };
  }
  return { ok: true, errors: {}, value: { status } };
}
