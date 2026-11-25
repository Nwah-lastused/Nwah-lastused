// Search, filtering, sorting and dashboard summary. Shared by the local adapter and the server.
import { CATEGORIES, ACTIONS, categoryLabel } from './constants.js';
import { evaluateItem, mergeSettings } from './reminders.js';
import { todayISO, toDateISO, daysBetween } from './dates.js';

/** Normalizes Arabic text for search: strips diacritics and unifies letter variants. */
export function normalizeArabic(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

export function enrichItems(items, settings, now = new Date()) {
  return items.map((item) => ({ ...item, evaluation: evaluateItem(item, settings, now) }));
}

const STATE_TESTS = {
  active: (e) => e.active,
  attention: (e) => e.active && e.state === 'attention',
  regular: (e) => e.active && e.state === 'regular',
  expiring: (e) => e.active && (e.expiringSoon || e.expired),
  unused: (e) => e.active && e.isUnused,
  replacement: (e) => e.active && e.replacementSoon,
  archived: (e) => !e.active,
  all: () => true
};

const searchText = (it) =>
  normalizeArabic(`${it.name} ${it.notes || ''} ${categoryLabel(it, 'ar')} ${categoryLabel(it, 'en')}`);

export function queryItems(items, query = {}, settings, now = new Date()) {
  const q = normalizeArabic(query.q);
  const state = STATE_TESTS[query.state] ? query.state : 'active';
  const sort = query.sort || 'last_used_asc';
  let list = enrichItems(items, settings, now).filter((it) => STATE_TESTS[state](it.evaluation));
  if (query.category) list = list.filter((it) => it.category === query.category);
  if (q) list = list.filter((it) => searchText(it).includes(q));

  const lastUsed = (it) => toDateISO(it.last_used_at) || it.purchase_date || toDateISO(it.created_at) || '';
  const cmp = {
    last_used_asc: (a, b) => lastUsed(a).localeCompare(lastUsed(b)),
    last_used_desc: (a, b) => lastUsed(b).localeCompare(lastUsed(a)),
    expiry_asc: (a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'),
    name_asc: (a, b) => a.name.localeCompare(b.name, ['ar', 'en']),
    created_desc: (a, b) => String(b.created_at).localeCompare(String(a.created_at))
  }[sort] || (() => 0);
  return list.sort(cmp);
}

/**
 * Dashboard summary computed from real data only.
 * rescued = rescue decisions + low-use alerts resolved because the item was used.
 */
export function buildDashboard({ items, notifications, actions, logs }, settingsIn, now = new Date()) {
  const settings = mergeSettings(settingsIn);
  const today = todayISO(now);
  const window = settings.upcomingWindowDays;
  const enriched = enrichItems(items, settings, now);
  const active = enriched.filter((i) => i.evaluation.active);

  const expiringSoon = active
    .filter((i) => i.expiry_date && i.evaluation.daysToExpiry <= Math.max(window, i.evaluation.settings.expiryAlertDays))
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
    .map((i) => ({ id: i.id, name: i.name, expiry_date: i.expiry_date, daysLeft: i.evaluation.daysToExpiry, category: i.category }));

  const unused = active
    .filter((i) => i.evaluation.isUnused)
    .sort((a, b) => b.evaluation.daysSinceUse - a.evaluation.daysSinceUse)
    .map((i) => ({ id: i.id, name: i.name, daysSince: i.evaluation.daysSinceUse, threshold: i.evaluation.settings.unusedDays, category: i.category }));

  const upcoming = [];
  for (const i of active) {
    const e = i.evaluation;
    const push = (type, date) => {
      const d = daysBetween(today, date);
      if (d >= 0 && d <= window) upcoming.push({ itemId: i.id, name: i.name, type, date, daysLeft: d });
    };
    if (i.expiry_date) push('expiry', i.expiry_date);
    if (e.replacementDue) push('replacement', e.replacementDue);
    if (e.unusedDueDate) push('unused', e.unusedDueDate);
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  const counts = new Map();
  for (const i of active) counts.set(i.category, (counts.get(i.category) || 0) + 1);
  const byCategory = CATEGORIES.filter((c) => counts.has(c.value))
    .map((c) => ({ category: c.value, icon: c.icon, count: counts.get(c.value) }))
    .sort((a, b) => b.count - a.count);

  const usedWithin = active.filter((i) => !i.evaluation.isUnused).length;
  const rescuedByActions = (actions || []).filter((a) => ACTIONS[a.action_type]?.rescued).length;
  const rescuedByUse = (notifications || []).filter((n) => n.type === 'unused' && n.status === 'closed' && n.closed_reason === 'resolved').length;
  const usesLast30 = (logs || []).filter((l) => daysBetween(toDateISO(l.used_at), today) <= 30).length;

  return {
    today,
    totals: {
      active: active.length,
      archived: enriched.length - active.length,
      attention: active.filter((i) => i.evaluation.state === 'attention').length,
      openNotifications: (notifications || []).filter((n) => n.status === 'new').length,
      usageRate: active.length ? Math.round((usedWithin / active.length) * 100) : null,
      rescued: rescuedByActions + rescuedByUse,
      usesLast30
    },
    expiringSoon: expiringSoon.slice(0, 6),
    unused: unused.slice(0, 6),
    upcoming: upcoming.slice(0, 6),
    byCategory,
    settings
  };
}
