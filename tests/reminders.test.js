// اختبارات منطق التذكيرات والتحقق (لا تحتاج Supabase ولا اتصالًا): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateItem, desiredNotifications, planNotificationSync, replacementDueDate } from '../public/js/shared/reminders.js';
import { validateItem, validateRegistration } from '../public/js/shared/validation.js';
import { addMonths } from '../public/js/shared/dates.js';
import { queryItems, normalizeArabic } from '../public/js/shared/summary.js';

const NOW = new Date('2026-11-24T09:00:00Z'); // 12:00 بتوقيت الرياض
const base = { id: 'a', name: 'غرض', category: 'other', status: 'active', condition: 'good', created_at: '2026-01-01T00:00:00Z' };

test('تنبيه الصلاحية ضمن مهلة التنبيه أو بعد الانتهاء', () => {
  const soon = evaluateItem({ ...base, expiry_date: '2026-11-30' }, { expiryAlertDays: 14 }, NOW);
  assert.equal(soon.triggers[0].type, 'expiry');
  assert.equal(soon.daysToExpiry, 6);
  const far = evaluateItem({ ...base, last_used_at: NOW.toISOString(), expiry_date: '2027-06-01' }, { expiryAlertDays: 14 }, NOW);
  assert.equal(far.triggers.length, 0);
  const expired = evaluateItem({ ...base, expiry_date: '2026-11-01' }, {}, NOW);
  assert.equal(expired.expired, true);
  assert.equal(expired.recommendation.key, 'dispose');
});

test('قلة الاستخدام تعتمد حد الغرض ثم الإعداد العام', () => {
  const item = { ...base, last_used_at: '2026-09-01T09:00:00Z' }; // 84 يومًا
  assert.equal(evaluateItem(item, { unusedDays: 60 }, NOW).isUnused, true);
  assert.equal(evaluateItem({ ...item, unused_after_days: 100 }, { unusedDays: 60 }, NOW).isUnused, false);
});

test('موعد الاستبدال يُحسب من تاريخ الشراء مع الأشهر', () => {
  assert.equal(replacementDueDate({ ...base, needs_replacement: true, replacement_interval: 3, replacement_unit: 'months', purchase_date: '2026-01-31' }), '2026-04-30');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
});

test('لا تكرار للتنبيهات، وتسجيل الاستخدام يغلق تنبيه قلة الاستخدام', () => {
  const item = { ...base, last_used_at: '2026-06-01T09:00:00Z' };
  const desired = desiredNotifications(item, {}, NOW);
  const existing = desired.map((d, i) => ({ ...d, id: `n${i}`, status: 'new' }));
  assert.deepEqual(planNotificationSync(existing, desired), { toInsert: [], toClose: [] });
  const closedByUser = existing.map((n) => ({ ...n, status: 'closed' }));
  assert.equal(planNotificationSync(closedByUser, desired).toInsert.length, 0, 'المغلق لا يعود');
  const afterUse = desiredNotifications({ ...item, last_used_at: NOW.toISOString() }, {}, NOW);
  assert.deepEqual(planNotificationSync(existing, afterUse).toClose, ['n0']);
});

test('التحقق يمنع التواريخ غير المنطقية', () => {
  const r = validateItem({ name: 'x', purchase_date: '2026-11-10', expiry_date: '2026-11-01', last_used_at: '2026-11-05' }, NOW);
  assert.ok(r.errors.expiry_date);
  assert.ok(r.errors.last_used_at);
  assert.ok(validateItem({ name: 'x', purchase_date: '2030-01-01' }, NOW).errors.purchase_date);
  assert.ok(validateItem({ name: 'x', needs_replacement: true }, NOW).errors.replacement_interval);
});

test('التسجيل باسم مستخدم وكلمة مرور فقط', () => {
  assert.equal(validateRegistration({ full_name: 'سارة', username: 'Sara_1', password: 'secret123' }).ok, true);
  assert.ok(validateRegistration({ full_name: 'س', username: 'a b', password: '123' }).errors.username);
});

test('البحث العربي يتجاهل الهمزات والتشكيل', () => {
  assert.equal(normalizeArabic('إِبْرِيق'), normalizeArabic('ابريق'));
  const list = queryItems([{ ...base, name: 'إبريق شاي' }], { q: 'ابريق' }, {}, NOW);
  assert.equal(list.length, 1);
});
