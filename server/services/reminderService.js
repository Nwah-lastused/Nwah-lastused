// Reminder computation with de-duplication: one notification per (item, type, due date),
// enforced by a UNIQUE constraint and an ignore-duplicates upsert.
import { desiredNotifications, planNotificationSync } from '../../public/js/shared/reminders.js';
import { getSettings, listItems, listNotifications } from './dataService.js';
import { unwrap } from '../utils/http.js';
import { adminClient } from '../config/supabase.js';

const THROTTLE_MS = 60_000;
const lastRun = new Map();

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
    unwrap(await db.from('notifications').upsert(inserts, { onConflict: 'item_id,type,due_date', ignoreDuplicates: true }));
  }
  if (closes.length) {
    unwrap(
      await db.from('notifications').update({ status: 'closed', closed_reason: 'resolved' }).eq('owner_id', userId).in('id', closes)
    );
  }
  return { created: inserts.length, closed: closes.length };
}

export async function syncItem(db, userId, item, settings = null, now = new Date()) {
  const s = settings || (await getSettings(db, userId));
  const existing = await listNotifications(db, userId, item.id);
  return applyPlans(db, userId, [item], existing, s, now);
}

export async function runForUser(db, userId, now = new Date()) {
  const [settings, items, notifications] = await Promise.all([
    getSettings(db, userId),
    listItems(db, userId),
    listNotifications(db, userId)
  ]);
  lastRun.set(userId, Date.now());
  return applyPlans(db, userId, items, notifications, settings, now);
}

/** Runs at most once per minute per user when data is requested. */
export async function maybeRunForUser(db, userId) {
  if (Date.now() - (lastRun.get(userId) || 0) < THROTTLE_MS) return null;
  try {
    return await runForUser(db, userId);
  } catch (e) {
    console.warn('[reminders] check failed:', e.message);
    return null;
  }
}

export function resetThrottle(userId) {
  lastRun.delete(userId);
}

/** Checks every user with the service-role client (startup and interval runs). */
export async function runForAllUsers() {
  const admin = await adminClient();
  if (!admin) return { skipped: true };
  const profiles = unwrap(await admin.from('profiles').select('id')) || [];
  const total = { users: 0, created: 0, closed: 0 };
  for (const p of profiles) {
    try {
      const r = await runForUser(admin, p.id);
      total.users++;
      total.created += r.created;
      total.closed += r.closed;
    } catch (e) {
      console.warn(`[reminders] user ${p.id} failed:`, e.message);
    }
  }
  return total;
}
