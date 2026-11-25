// Demo data for the current user, loaded only on explicit request. Disabled in production by default.
import express from 'express';
import { env } from '../config/env.js';
import { asyncHandler, ok, HttpError, unwrap } from '../utils/http.js';
import { validateItem } from '../utils/validation.js';
import { buildDemoItems } from '../../public/js/shared/demo-data.js';
import { runForUser } from '../services/reminderService.js';

const router = express.Router();

router.use((req, res, next) => (env.allowDemoData ? next() : next(new HttpError(403, 'demo_disabled'))));

async function clearDemo(db, userId) {
  const rows = unwrap(await db.from('items').delete().eq('owner_id', userId).eq('is_demo', true).select('id'));
  return rows?.length || 0;
}

router.post(
  '/load',
  asyncHandler(async (req, res) => {
    const { db, user } = req;
    if (req.body?.replace !== false) await clearDemo(db, user.id);
    const demo = buildDemoItems(new Date(), req.lang);
    const rows = demo.map(({ usesAt, is_demo, ...input }) => ({ ...validateItem(input).value, owner_id: user.id, is_demo: true }));
    const inserted = unwrap(await db.from('items').insert(rows).select('id, name'));
    const idByName = new Map(inserted.map((r) => [r.name, r.id]));
    const logs = demo.flatMap((d) => d.usesAt.map((at) => ({ owner_id: user.id, item_id: idByName.get(d.name), used_at: at })));
    if (logs.length) unwrap(await db.from('item_usage_logs').insert(logs));
    await runForUser(db, user.id);
    ok(res, { count: inserted.length }, 201);
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    ok(res, { removed: await clearDemo(req.db, req.user.id) });
  })
);

export default router;
