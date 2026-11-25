// Reminder rules, item state and suggestions. Shared by the local adapter and the server.
import { DEFAULT_SETTINGS, categoryInfo } from './constants.js';
import { todayISO, toDateISO, daysBetween, addDays, addMonths, daysLabel, formatDate } from './dates.js';
import { t } from './i18n.js';

export function mergeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

/** Item-level overrides take precedence over the user's defaults. */
export function effectiveItemSettings(item, settings) {
  const s = mergeSettings(settings);
  const own = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    unusedDays: own(item.unused_after_days) ?? s.unusedDays,
    expiryAlertDays: own(item.alert_days_before) ?? s.expiryAlertDays,
    replacementAlertDays: own(item.alert_days_before) ?? s.replacementAlertDays
  };
}

/** Low-use baseline: last use, else purchase date, else creation date. */
export function usageBaseDate(item) {
  return toDateISO(item.last_used_at) || item.purchase_date || toDateISO(item.created_at);
}

/**
 * Replacement due date. Based on the purchase date (start of the current unit's life),
 * falling back to last use, then creation date. Recording "replaced" resets the purchase date.
 */
export function replacementDueDate(item) {
  if (!item.needs_replacement || !item.replacement_interval) return null;
  const base = item.purchase_date || toDateISO(item.last_used_at) || toDateISO(item.created_at);
  if (!base) return null;
  const n = Number(item.replacement_interval);
  return item.replacement_unit === 'months' ? addMonths(base, n) : addDays(base, n);
}

/** Suggestion key for an item, or null. */
export function recommendationKey(item, ev) {
  if (item.status && item.status !== 'active') return null;
  if (item.condition === 'broken') return 'repair';
  if (item.condition === 'damaged' || ev.expired) return item.category === 'medicine' ? 'disposeMedicine' : 'dispose';
  if (!ev.isUnused) return null;
  if (categoryInfo(item.category).consumable) return 'useOrGift';
  if (ev.daysSinceUse >= ev.settings.unusedDays * 2) return 'giftDonate';
  return 'reuse';
}

export function recommendationText(key, lang) {
  return key ? { key, title: t(`rec.${key}.title`, {}, lang), text: t(`rec.${key}.text`, {}, lang) } : null;
}

/**
 * Evaluates an item on a given day. Returns structured data only (no text);
 * use formatTrigger / recommendationText to render it in a language.
 */
export function evaluateItem(item, settings, now = new Date()) {
  const s = effectiveItemSettings(item, settings);
  const today = todayISO(now);
  const active = !item.status || item.status === 'active';

  const ev = {
    today,
    settings: s,
    active,
    daysToExpiry: null,
    expired: false,
    expiringSoon: false,
    daysSinceUse: null,
    unusedDueDate: null,
    isUnused: false,
    replacementDue: null,
    daysToReplacement: null,
    replacementSoon: false,
    triggers: []
  };

  if (item.expiry_date) {
    ev.daysToExpiry = daysBetween(today, item.expiry_date);
    ev.expired = ev.daysToExpiry < 0;
    ev.expiringSoon = ev.daysToExpiry <= s.expiryAlertDays;
  }

  const base = usageBaseDate(item);
  if (base) {
    ev.daysSinceUse = Math.max(0, daysBetween(base, today));
    ev.unusedDueDate = addDays(base, s.unusedDays);
    // Expired or damaged items are not flagged as low-use.
    ev.isUnused = ev.daysSinceUse > s.unusedDays && !ev.expired && item.condition !== 'damaged';
  }

  ev.replacementDue = replacementDueDate(item);
  if (ev.replacementDue) {
    ev.daysToReplacement = daysBetween(today, ev.replacementDue);
    ev.replacementSoon = ev.daysToReplacement <= s.replacementAlertDays;
  }

  if (active) {
    if (item.expiry_date && ev.expiringSoon) {
      ev.triggers.push({ type: 'expiry', dueDate: item.expiry_date, days: ev.daysToExpiry });
    }
    if (ev.isUnused) {
      ev.triggers.push({ type: 'unused', dueDate: ev.unusedDueDate, days: ev.daysSinceUse, limit: s.unusedDays });
    }
    if (ev.replacementDue && ev.replacementSoon) {
      ev.triggers.push({ type: 'replacement', dueDate: ev.replacementDue, days: ev.daysToReplacement });
    }
  }

  ev.recommendation = recommendationKey(item, ev);
  if (!active) ev.state = 'archived';
  else if (ev.triggers.length || item.condition === 'broken' || item.condition === 'damaged') ev.state = 'attention';
  else ev.state = 'regular';
  return ev;
}

/** Renders a trigger (or a stored notification) as title / reason / suggestion text. */
export function formatTrigger({ type, days, limit, dueDate, recommendation }, name, lang, now = new Date()) {
  const d = days ?? (dueDate ? daysBetween(todayISO(now), dueDate) : 0);
  const p = { name, days: daysLabel(d, lang) };
  if (type === 'expiry') {
    const expired = d < 0;
    return {
      title: t(expired ? 'trig.expiry.titleExpired' : 'trig.expiry.titleSoon', p, lang),
      reason: t(expired ? 'trig.expiry.reasonExpired' : d === 0 ? 'trig.expiry.reasonToday' : 'trig.expiry.reasonSoon', p, lang),
      suggestion: t(expired ? 'trig.expiry.suggestExpired' : 'trig.expiry.suggestSoon', p, lang)
    };
  }
  if (type === 'replacement') {
    return {
      title: t('trig.replacement.title', p, lang),
      reason: t(d < 0 ? 'trig.replacement.reasonOver' : d === 0 ? 'trig.replacement.reasonToday' : 'trig.replacement.reasonSoon', p, lang),
      suggestion: t('trig.replacement.suggest', p, lang)
    };
  }
  const rec = recommendationText(recommendation, lang);
  return {
    title: t('trig.unused.title', p, lang),
    reason: limit
      ? t('trig.unused.reason', { ...p, limit: daysLabel(limit, lang) }, lang)
      : t('trig.unused.reasonSince', { date: formatDate(dueDate, {}, lang) }, lang),
    suggestion: rec ? `${rec.title}: ${rec.text}` : t('trig.unused.suggest', p, lang)
  };
}

export const notificationKey = (n) => `${n.type}|${n.due_date}`;

/** Notifications that should exist for an item now. Stored text uses the given language. */
export function desiredNotifications(item, settings, now = new Date(), lang = 'ar') {
  const ev = evaluateItem(item, settings, now);
  return ev.triggers.map((trigger) => ({
    item_id: item.id,
    type: trigger.type,
    due_date: trigger.dueDate,
    ...formatTrigger({ ...trigger, recommendation: ev.recommendation }, item.name, lang, now)
  }));
}

/**
 * De-duplication plan: one notification per (item, type, due date), never recreated once it exists.
 * Open notifications that are no longer due are closed as "resolved".
 */
export function planNotificationSync(existingForItem, desired) {
  const existingKeys = new Set(existingForItem.map(notificationKey));
  const desiredKeys = new Set(desired.map(notificationKey));
  return {
    toInsert: desired.filter((d) => !existingKeys.has(notificationKey(d))),
    toClose: existingForItem.filter((n) => n.status !== 'closed' && !desiredKeys.has(notificationKey(n))).map((n) => n.id)
  };
}

/** Item changes caused by a sustainability decision. */
export function actionEffects(actionType, now = new Date()) {
  switch (actionType) {
    case 'reused':
      return { patch: { last_used_at: now.toISOString() }, logUsage: true };
    case 'repaired':
      return { patch: { condition: 'good' }, logUsage: false };
    case 'replaced':
      return { patch: { purchase_date: todayISO(now), condition: 'good', last_used_at: now.toISOString() }, logUsage: true };
    case 'gifted':
    case 'donated':
    case 'disposed':
      return { patch: { status: actionType }, logUsage: false };
    case 'kept':
    default:
      return { patch: {}, logUsage: false, closeTypes: ['unused'] };
  }
}
