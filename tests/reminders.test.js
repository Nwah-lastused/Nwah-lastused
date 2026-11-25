import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateItem, desiredNotifications, planNotificationSync, replacementDueDate, formatTrigger } from '../public/js/shared/reminders.js';
import { validateItem, validateRegistration } from '../public/js/shared/validation.js';
import { addMonths, relativeDays, daysLabel } from '../public/js/shared/dates.js';
import { queryItems, normalizeArabic } from '../public/js/shared/summary.js';
import { t } from '../public/js/shared/i18n.js';

const NOW = new Date('2026-11-24T09:00:00Z');
const base = { id: 'a', name: 'Item', category: 'other', status: 'active', condition: 'good', created_at: '2026-01-01T00:00:00Z' };

test('expiry alert within the alert window or after expiry', () => {
  const soon = evaluateItem({ ...base, last_used_at: NOW.toISOString(), expiry_date: '2026-11-30' }, { expiryAlertDays: 14 }, NOW);
  assert.equal(soon.triggers[0].type, 'expiry');
  assert.equal(soon.daysToExpiry, 6);
  const far = evaluateItem({ ...base, last_used_at: NOW.toISOString(), expiry_date: '2027-06-01' }, { expiryAlertDays: 14 }, NOW);
  assert.equal(far.triggers.length, 0);
  const expired = evaluateItem({ ...base, expiry_date: '2026-11-01' }, {}, NOW);
  assert.equal(expired.expired, true);
  assert.equal(expired.recommendation, 'dispose');
});

test('low-use threshold prefers the item value over the default', () => {
  const item = { ...base, last_used_at: '2026-09-01T09:00:00Z' };
  assert.equal(evaluateItem(item, { unusedDays: 60 }, NOW).isUnused, true);
  assert.equal(evaluateItem({ ...item, unused_after_days: 100 }, { unusedDays: 60 }, NOW).isUnused, false);
});

test('replacement due date is based on the purchase date', () => {
  const item = { ...base, needs_replacement: true, replacement_interval: 3, replacement_unit: 'months', purchase_date: '2026-01-31' };
  assert.equal(replacementDueDate(item), '2026-04-30');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
});

test('notifications are never duplicated and a new use resolves low-use alerts', () => {
  const item = { ...base, last_used_at: '2026-06-01T09:00:00Z' };
  const desired = desiredNotifications(item, {}, NOW);
  const existing = desired.map((d, i) => ({ ...d, id: `n${i}`, status: 'new' }));
  assert.deepEqual(planNotificationSync(existing, desired), { toInsert: [], toClose: [] });
  const closedByUser = existing.map((n) => ({ ...n, status: 'closed' }));
  assert.equal(planNotificationSync(closedByUser, desired).toInsert.length, 0);
  const afterUse = desiredNotifications({ ...item, last_used_at: NOW.toISOString() }, {}, NOW);
  assert.deepEqual(planNotificationSync(existing, afterUse).toClose, ['n0']);
});

test('validation rejects inconsistent dates', () => {
  const r = validateItem({ name: 'x', purchase_date: '2026-11-10', expiry_date: '2026-11-01', last_used_at: '2026-11-05' }, NOW);
  assert.ok(r.errors.expiry_date);
  assert.ok(r.errors.last_used_at);
  assert.ok(validateItem({ name: 'x', purchase_date: '2030-01-01' }, NOW).errors.purchase_date);
  assert.ok(validateItem({ name: 'x', needs_replacement: true }, NOW).errors.replacement_interval);
});

test('registration requires only name, username and password', () => {
  assert.equal(validateRegistration({ full_name: 'Sara', username: 'Sara_1', password: 'secret123' }).ok, true);
  assert.ok(validateRegistration({ full_name: 'S', username: 'a b', password: '123' }).errors.username);
});

test('Arabic search ignores hamza variants and diacritics', () => {
  assert.equal(normalizeArabic('إِبْرِيق'), normalizeArabic('ابريق'));
  assert.equal(queryItems([{ ...base, name: 'إبريق شاي' }], { q: 'ابريق' }, {}, NOW).length, 1);
});

test('messages are localized in Arabic and English', () => {
  assert.equal(t('nav.items', {}, 'ar'), 'أغراضي');
  assert.equal(t('nav.items', {}, 'en'), 'My items');
  assert.equal(daysLabel(5, 'en'), '5 days');
  assert.equal(relativeDays(-3, 'en'), '3 days ago');
  assert.equal(validateItem({ name: '' }, NOW, 'en').errors.name, 'Item name is required.');
  const text = formatTrigger({ type: 'expiry', days: 3 }, 'Milk', 'en');
  assert.equal(text.reason, 'Expires in 3 days.');
});
