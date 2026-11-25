// Date helpers. Calendar math uses the Asia/Riyadh day; timestamps are stored as UTC ISO strings.
import { TIMEZONE } from './constants.js';
import { LANGUAGES, getLang, normalizeLang } from './i18n.js';

const DAY_MS = 86400000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function todayISO(now = new Date()) {
  return ymdFormatter.format(now);
}

export function isISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Calendar date (YYYY-MM-DD) of a timestamp in Riyadh time. */
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

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function addDays(iso, n) {
  return new Date(toUTC(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Adds months, clamping to the last day of the target month. */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Converts a date input value to a timestamp: now if today, otherwise noon Riyadh time. */
export function dateInputToTimestamp(value, now = new Date()) {
  if (!value) return null;
  if (!isISODate(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value === todayISO(now)) return now.toISOString();
  return new Date(`${value}T12:00:00+03:00`).toISOString();
}

// ---------- Localized formatting ----------
const localeOf = (lang) => LANGUAGES[normalizeLang(lang)].locale;

export function formatDate(value, opts = {}, lang = getLang()) {
  if (!value) return '—';
  const d = isISODate(value) ? new Date(`${value}T12:00:00+03:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...opts
  }).format(d);
}

export function formatDateTime(value, lang = getLang()) {
  return formatDate(value, { hour: 'numeric', minute: '2-digit' }, lang);
}

export function formatNumber(n, opts = {}, lang = getLang()) {
  return new Intl.NumberFormat(localeOf(lang), opts).format(n);
}

function countLabel(n, lang, forms) {
  const abs = Math.abs(n);
  const num = formatNumber(abs, {}, lang);
  if (normalizeLang(lang) === 'en') return `${num} ${abs === 1 ? forms.enOne : forms.enMany}`;
  if (abs === 1) return forms.arOne;
  if (abs === 2) return forms.arTwo;
  if (abs >= 3 && abs <= 10) return `${num} ${forms.arFew}`;
  return `${num} ${forms.arMany}`;
}

export function daysLabel(n, lang = getLang()) {
  return countLabel(n, lang, { enOne: 'day', enMany: 'days', arOne: 'يوم واحد', arTwo: 'يومان', arFew: 'أيام', arMany: 'يومًا' });
}

export function monthsLabel(n, lang = getLang()) {
  return countLabel(n, lang, { enOne: 'month', enMany: 'months', arOne: 'شهر واحد', arTwo: 'شهران', arFew: 'أشهر', arMany: 'شهرًا' });
}

/** Relative day phrase; n is the day offset from today to the date. */
export function relativeDays(n, lang = getLang()) {
  const en = normalizeLang(lang) === 'en';
  if (n === 0) return en ? 'today' : 'اليوم';
  if (n === 1) return en ? 'tomorrow' : 'غدًا';
  if (n === -1) return en ? 'yesterday' : 'أمس';
  if (en) return n > 0 ? `in ${daysLabel(n, lang)}` : `${daysLabel(n, lang)} ago`;
  const unit = Math.abs(n) === 2 ? 'يومين' : daysLabel(n, lang);
  return n > 0 ? `بعد ${unit}` : `منذ ${unit}`;
}
