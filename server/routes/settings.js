import express from 'express';
import { asyncHandler, ok, badRequest, unwrap } from '../utils/http.js';
import { validateSettings } from '../utils/validation.js';
import { getProfile } from '../services/dataService.js';
import { mergeSettings } from '../../public/js/shared/reminders.js';
import { resetThrottle } from '../services/reminderService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = await getProfile(req.db, req.user.id);
    ok(res, { settings: mergeSettings(p?.settings), profile: p && { id: p.id, username: p.username, full_name: p.full_name } });
  })
);

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const v = validateSettings(req.body, req.lang);
    if (!v.ok) throw badRequest(v.errors);
    const p = await getProfile(req.db, req.user.id);
    const settings = mergeSettings({ ...(p?.settings || {}), ...v.value });
    const patch = { settings };
    if (v.full_name) patch.full_name = v.full_name;
    unwrap(await req.db.from('profiles').update(patch).eq('id', req.user.id));
    resetThrottle(req.user.id);
    ok(res, settings);
  })
);

export default router;
