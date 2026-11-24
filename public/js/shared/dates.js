// أدوات التواريخ: كل الحسابات اليومية تتم بتوقيت الرياض (Asia/Riyadh)،
// وتخزن الطوابع الزمنية بصيغة ISO (UTC) في قاعدة البيانات.
import { TIMEZONE } from './constants.js';

const DAY_MS = 86400000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** تاريخ اليوم (YYYY-MM-DD) بتوقيت الرياض. */
export function todayISO(now = new Date()) {
  return ymdFormatter.format(now);
}

export function isISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** يحوّل طابعًا زمنيًا أو تاريخًا إلى تاريخ يومي بتوقيت الرياض. */
export function toDateISO(value) {
  if (!value) return null;
  if (isISODate(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return ymdFormatter.format(d);
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** عدد الأيام من a إلى b (موجب إذا كان b بعد a). */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function addDays(iso, n) {
  const d = new Date(toUTC(iso) + n * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** إضافة أشهر مع تثبيت اليوم عند نهاية الشهر (31 يناير + شهر = 28/29 فبراير). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * يحوّل قيمة «تاريخ آخر استخدام» القادمة من نموذج (YYYY-MM-DD) إلى طابع زمني:
 * إن كانت اليوم نستخدم اللحظة الحالية، وإلا منتصف النهار بتوقيت الرياض.
 */
export function dateInputToTimestamp(value, now = new Date()) {
  if (!value) return null;
  if (!isISODate(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value === todayISO(now)) return now.toISOString();
  return new Date(`${value}T12:00:00+03:00`).toISOString();
}

// ---------- التنسيق بالعربية ----------
const LOCALE = 'ar-SA-u-ca-gregory-nu-arab';

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = isISODate(value) ? new Date(`${value}T12:00:00+03:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...opts
  }).format(d);
}

export function formatDateTime(value) {
  return formatDate(value, { hour: 'numeric', minute: '2-digit' });
}

export function formatNumber(n, opts = {}) {
  return new Intl.NumberFormat(LOCALE, opts).format(n);
}

/** صياغة عدد الأيام بالعربية مع مراعاة المثنى والجمع. */
export function daysLabel(n) {
  const abs = Math.abs(n);
  if (abs === 1) return 'يوم واحد';
  if (abs === 2) return 'يومان';
  if (abs >= 3 && abs <= 10) return `${formatNumber(abs)} أيام`;
  return `${formatNumber(abs)} يومًا`;
}

/** «اليوم» / «بعد ٣ أيام» / «منذ يومين». n = الفرق من اليوم إلى التاريخ. */
export function relativeDays(n) {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غدًا';
  if (n === -1) return 'أمس';
  const abs = Math.abs(n);
  const unit = abs === 2 ? 'يومين' : daysLabel(abs);
  return n > 0 ? `بعد ${unit}` : `منذ ${unit}`;
}

export function monthsLabel(n) {
  const abs = Math.abs(n);
  if (abs === 1) return 'شهر واحد';
  if (abs === 2) return 'شهران';
  if (abs >= 3 && abs <= 10) return `${formatNumber(abs)} أشهر`;
  return `${formatNumber(abs)} شهرًا`;
}
