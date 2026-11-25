import express from 'express';
import { asyncHandler, ok, badRequest, unwrap, HttpError } from '../utils/http.js';
import { validateItem, validateAction, validateUsageNote, validateIdParam, queryString } from '../utils/validation.js';
import { getSettings, listItems, getItem, listNotifications, listActions, listLogs, addUsageLog } from '../services/dataService.js';
import { syncItem, maybeRunForUser } from '../services/reminderService.js';
import { uploadItemImage, removeImages, attachImageUrls } from '../services/storageService.js';
import { queryItems } from '../../public/js/shared/summary.js';
import { evaluateItem, actionEffects } from '../../public/js/shared/reminders.js';

const router = express.Router();
router.param('id', (req, res, next) => validateIdParam(req, res, next));

async function present(db, item, settings) {
  const [withUrl] = await attachImageUrls(db, [item]);
  return { ...withUrl, evaluation: evaluateItem(item, settings) };
}

const updateItem = async (db, userId, id, patch) =>
  unwrap(await db.from('items').update(patch).eq('owner_id', userId).eq('id', id).select('*').single());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { db, user } = req;
    await maybeRunForUser(db, user.id);
    const [settings, rows] = await Promise.all([getSettings(db, user.id), listItems(db, user.id)]);
    const query = {
      q: queryString(req.query.q),
      category: queryString(req.query.category, 30),
      state: queryString(req.query.state, 30),
      sort: queryString(req.query.sort, 30)
    };
    const items = await attachImageUrls(db, queryItems(rows, query, settings));
    ok(res, { items, total: items.length });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { db, user, lang } = req;
    const v = validateItem(req.body, new Date(), lang);
    if (!v.ok) throw badRequest(v.errors);
    let item = unwrap(await db.from('items').insert({ ...v.value, owner_id: user.id }).select('*').single());
    if (req.body?.image) {
      try {
        const path = await uploadItemImage(db, user.id, item.id, req.body.image, lang);
        item = await updateItem(db, user.id, item.id, { image_path: path });
      } catch (e) {
        await db.from('items').delete().eq('owner_id', user.id).eq('id', item.id);
        throw e;
      }
    }
    if (item.last_used_at) await addUsageLog(db, user.id, item.id, item.last_used_at);
    const settings = await getSettings(db, user.id);
    await syncItem(db, user.id, item, settings);
    ok(res, await present(db, item, settings), 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { db, user } = req;
    const { id } = req.params;
    const item = await getItem(db, user.id, id);
    const settings = await getSettings(db, user.id);
    await syncItem(db, user.id, item, settings);
    const [notifications, actions, logs] = await Promise.all([
      listNotifications(db, user.id, id),
      listActions(db, user.id, id),
      listLogs(db, user.id, { itemId: id, limit: 100 })
    ]);
    ok(res, { item: await present(db, item, settings), notifications, actions, logs });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { db, user, lang } = req;
    const existing = await getItem(db, user.id, req.params.id);
    const { image, remove_image, ...input } = req.body || {};
    const v = validateItem({ ...existing, ...input }, new Date(), lang);
    if (!v.ok) throw badRequest(v.errors);

    const patch = { ...v.value };
    let oldImage = null;
    if (image) {
      patch.image_path = await uploadItemImage(db, user.id, existing.id, image, lang);
      oldImage = existing.image_path;
    } else if (remove_image) {
      patch.image_path = null;
      oldImage = existing.image_path;
    }

    const item = await updateItem(db, user.id, existing.id, patch);
    if (oldImage) await removeImages(db, [oldImage]);
    const prev = existing.last_used_at ? new Date(existing.last_used_at).getTime() : 0;
    if (item.last_used_at && new Date(item.last_used_at).getTime() > prev) {
      await addUsageLog(db, user.id, item.id, item.last_used_at);
    }
    const settings = await getSettings(db, user.id);
    await syncItem(db, user.id, item, settings);
    ok(res, await present(db, item, settings));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { db, user } = req;
    const item = await getItem(db, user.id, req.params.id);
    unwrap(await db.from('items').delete().eq('owner_id', user.id).eq('id', item.id));
    await removeImages(db, [item.image_path]);
    ok(res, { deleted: true });
  })
);

router.post(
  '/:id/use',
  asyncHandler(async (req, res) => {
    const { db, user, lang } = req;
    const v = validateUsageNote(req.body, lang);
    if (!v.ok) throw badRequest(v.errors);
    const existing = await getItem(db, user.id, req.params.id);
    if (existing.status !== 'active') throw new HttpError(422, 'archived_item');
    const now = new Date();
    const item = await updateItem(db, user.id, existing.id, { last_used_at: now.toISOString() });
    await addUsageLog(db, user.id, item.id, item.last_used_at, v.value.note);
    const settings = await getSettings(db, user.id);
    await syncItem(db, user.id, item, settings, now);
    ok(res, await present(db, item, settings));
  })
);

router.post(
  '/:id/action',
  asyncHandler(async (req, res) => {
    const { db, user, lang } = req;
    const v = validateAction(req.body, lang);
    if (!v.ok) throw badRequest(v.errors);
    const existing = await getItem(db, user.id, req.params.id);
    const now = new Date();
    const fx = actionEffects(v.value.action_type, now);

    const item = Object.keys(fx.patch).length ? await updateItem(db, user.id, existing.id, fx.patch) : existing;
    unwrap(await db.from('item_actions').insert({ owner_id: user.id, item_id: item.id, ...v.value }));
    if (fx.logUsage) await addUsageLog(db, user.id, item.id, now.toISOString(), v.value.note);
    if (fx.closeTypes?.length) {
      unwrap(
        await db
          .from('notifications')
          .update({ status: 'closed', closed_reason: 'user' })
          .eq('owner_id', user.id)
          .eq('item_id', item.id)
          .in('type', fx.closeTypes)
          .neq('status', 'closed')
      );
    }
    const settings = await getSettings(db, user.id);
    await syncItem(db, user.id, item, settings, now);
    ok(res, await present(db, item, settings));
  })
);

export default router;
