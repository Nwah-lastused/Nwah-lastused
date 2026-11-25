import express from 'express';
import { asyncHandler, ok } from '../utils/http.js';
import { getSettings, listItems, listNotifications, listActions, listLogs } from '../services/dataService.js';
import { maybeRunForUser } from '../services/reminderService.js';
import { buildDashboard } from '../../public/js/shared/summary.js';

const router = express.Router();
const LOG_WINDOW_MS = 31 * 86400000;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { db, user } = req;
    await maybeRunForUser(db, user.id);
    const since = new Date(Date.now() - LOG_WINDOW_MS).toISOString();
    const [settings, items, notifications, actions, logs] = await Promise.all([
      getSettings(db, user.id),
      listItems(db, user.id),
      listNotifications(db, user.id),
      listActions(db, user.id),
      listLogs(db, user.id, { sinceISO: since, limit: 2000 })
    ]);
    ok(res, buildDashboard({ items, notifications, actions, logs }, settings));
  })
);

export default router;
