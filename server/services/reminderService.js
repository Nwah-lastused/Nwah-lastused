// حساب التذكيرات ومنع تكرارها.
// القاعدة: تنبيه واحد فقط لكل (غرض، نوع، موعد استحقاق) — مضمون بقيد UNIQUE في قاعدة البيانات
// وبـ upsert مع ignoreDuplicates، فلا يتكرر عند إعادة تحميل الصفحة أو تشغيل الفحص مرتين.
// يعمل الفحص: عند بدء الخادم (لكل المستخدمين إن توفر مفتاح الخادم)، عند طلب البيانات (مع تهدئة)،
// يدويًا عبر POST /api/reminders/check، ودوريًا إن ضُبط REMINDER_INTERVAL_MINUTES.
import { desiredNotifications, planNotificationSync } from '../../public/js/shared/reminders.js';
import { getSettings, listItems, listNotifications } from './dataService.js';
import { unwrap } from '../utils/http.js';
import { adminClient } from '../config/supabase.js';

const THROTTLE_MS = 60_000;
const lastRun = new Map();

/** يطبّق خطة المزامنة لمجموعة أغراض دفعة واحدة. */
async function applyPlans(db, userId, items, notifications, settings, now) {
  const byItem = new Map();
  for (const n of notifications) {
    if (!byItem.has(n.item_id)) byItem.set(n.item_id, []);
    byItem.get(n.item_id).push(n);
  }
  const inserts = [];
  const closes = [];
  for (const item of items) {
    const plan = planNotificationSync(byItem.get(item.id) || [], desiredNotifications(item, settings, now));
    inserts.push(...plan.toInsert.map((n) => ({ ...n, owner_id: userId, status: 'new' })));
    closes.push(...plan.toClose);
  }
  if (inserts.length) {
    unwrap(
      await db.from('notifications').upsert(inserts, { onConflict: 'item_id,type,due_date', ignoreDuplicates: true }),
      'تعذّر إنشاء التنبيهات.'
    );
  }
  if (closes.length) {
    unwrap(
      await db
        .from('notifications')
        .update({ status: 'closed', closed_reason: 'resolved' })
        .eq('owner_id', userId)
        .in('id', closes),
      'تعذّر تحديث التنبيهات.'
    );
  }
  return { created: inserts.length, closed: closes.length };
}

/** مزامنة تنبيهات غرض واحد — تُستدعى بعد الإضافة والتعديل وتسجيل الاستخدام والقرارات. */
export async function syncItem(db, userId, item, settings = null, now = new Date()) {
  const s = settings || (await getSettings(db, userId));
  const existing = await listNotifications(db, userId, item.id);
  return applyPlans(db, userId, [item], existing, s, now);
}

/** فحص كامل لكل أغراض مستخدم. */
export async function runForUser(db, userId, now = new Date()) {
  const [settings, items, notifications] = await Promise.all([
    getSettings(db, userId),
    listItems(db, userId),
    listNotifications(db, userId)
  ]);
  lastRun.set(userId, Date.now());
  return applyPlans(db, userId, items, notifications, settings, now);
}

/** فحص عند طلب البيانات مع تهدئة (مرة في الدقيقة لكل مستخدم على الأكثر). */
export async function maybeRunForUser(db, userId) {
  if (Date.now() - (lastRun.get(userId) || 0) < THROTTLE_MS) return null;
  try {
    return await runForUser(db, userId);
  } catch (e) {
    console.warn('[reminders] فشل الفحص التلقائي:', e.message);
    return null;
  }
}

export function resetThrottle(userId) {
  lastRun.delete(userId);
}

/** فحص لكل المستخدمين بعميل الخادم (service_role) — عند بدء الخادم أو دوريًا. */
export async function runForAllUsers() {
  const admin = await adminClient();
  if (!admin) return { skipped: true, reason: 'لا يوجد SUPABASE_SERVICE_ROLE_KEY' };
  const profiles = unwrap(await admin.from('profiles').select('id')) || [];
  const total = { users: 0, created: 0, closed: 0 };
  for (const p of profiles) {
    try {
      const r = await runForUser(admin, p.id);
      total.users++;
      total.created += r.created;
      total.closed += r.closed;
    } catch (e) {
      console.warn(`[reminders] فشل فحص المستخدم ${p.id}:`, e.message);
    }
  }
  return total;
}
