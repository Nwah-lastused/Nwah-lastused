// استعلامات مشتركة. كل استعلام يقيّد owner_id صراحةً (دفاع إضافي فوق RLS،
// وضروري عند استخدام عميل admin في الفحص الدوري).
import { mergeSettings } from '../../public/js/shared/reminders.js';
import { unwrap, notFound } from '../utils/http.js';

export async function getProfile(db, userId) {
  const row = unwrap(await db.from('profiles').select('id, username, full_name, settings').eq('id', userId).maybeSingle());
  return row;
}

export async function getSettings(db, userId) {
  const p = await getProfile(db, userId);
  return mergeSettings(p?.settings);
}

export async function listItems(db, userId) {
  return unwrap(await db.from('items').select('*').eq('owner_id', userId).order('created_at', { ascending: false })) || [];
}

export async function getItem(db, userId, id) {
  const row = unwrap(await db.from('items').select('*').eq('owner_id', userId).eq('id', id).maybeSingle());
  if (!row) throw notFound('الغرض غير موجود.');
  return row;
}

export async function listNotifications(db, userId, itemId = null) {
  let q = db.from('notifications').select('*').eq('owner_id', userId);
  if (itemId) q = q.eq('item_id', itemId);
  return unwrap(await q.order('created_at', { ascending: false })) || [];
}

export async function listActions(db, userId, itemId = null) {
  let q = db.from('item_actions').select('*').eq('owner_id', userId);
  if (itemId) q = q.eq('item_id', itemId);
  return unwrap(await q.order('created_at', { ascending: false })) || [];
}

export async function listLogs(db, userId, { itemId = null, sinceISO = null, limit = 500 } = {}) {
  let q = db.from('item_usage_logs').select('*').eq('owner_id', userId);
  if (itemId) q = q.eq('item_id', itemId);
  if (sinceISO) q = q.gte('used_at', sinceISO);
  return unwrap(await q.order('used_at', { ascending: false }).limit(limit)) || [];
}

export async function addUsageLog(db, userId, itemId, usedAt, note = null) {
  unwrap(await db.from('item_usage_logs').insert({ owner_id: userId, item_id: itemId, used_at: usedAt, note }));
}
