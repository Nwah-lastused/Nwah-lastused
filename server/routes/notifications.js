import express from 'express';
import { asyncHandler, ok, badRequest, notFound, unwrap } from '../utils/http.js';
import { validateNotificationPatch, validateIdParam, queryString } from '../utils/validation.js';
import { listNotifications, listItems } from '../services/dataService.js';
import { maybeRunForUser, runForUser } from '../services/reminderService.js';

export const notificationsRouter = express.Router();
notificationsRouter.param('id', (req, res, next) => validateIdParam(req, res, next));

// GET /api/notifications?status=open|new|read|closed|all&type=expiry|unused|replacement
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { db, user } = req;
    await maybeRunForUser(db, user.id);
    const [all, items] = await Promise.all([listNotifications(db, user.id), listItems(db, user.id)]);
    const names = new Map(items.map((i) => [i.id, i.name]));
    const counts = { new: 0, read: 0, closed: 0 };
    all.forEach((n) => counts[n.status]++);
    const status = queryString(req.query.status, 10) || 'open';
    const type = queryString(req.query.type, 20);
    let list = all.map((n) => ({ ...n, item_name: names.get(n.item_id) || 'غرض محذوف' }));
    if (status === 'open') list = list.filter((n) => n.status !== 'closed');
    else if (status !== 'all') list = list.filter((n) => n.status === status);
    if (type) list = list.filter((n) => n.type === type);
    list.sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || String(b.created_at).localeCompare(String(a.created_at)));
    ok(res, { notifications: list, counts });
  })
);

notificationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = validateNotificationPatch(req.body);
    if (!v.ok) throw badRequest('حالة غير صالحة.', v.errors);
    const patch = { status: v.value.status, closed_reason: v.value.status === 'closed' ? 'user' : null };
    const row = unwrap(
      await req.db.from('notifications').update(patch).eq('owner_id', req.user.id).eq('id', req.params.id).select('*').maybeSingle()
    );
    if (!row) throw notFound('التنبيه غير موجود.');
    ok(res, row);
  })
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    unwrap(await req.db.from('notifications').update({ status: 'read' }).eq('owner_id', req.user.id).eq('status', 'new'));
    ok(res, { updated: true });
  })
);

// POST /api/reminders/check — تشغيل يدوي لفحص التذكيرات للمستخدم المصادق عليه
export const remindersRouter = express.Router();
remindersRouter.post(
  '/check',
  asyncHandler(async (req, res) => {
    ok(res, await runForUser(req.db, req.user.id));
  })
);
