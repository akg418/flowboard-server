import { Router } from 'express';
import mongoose from 'mongoose';
import Log from '../models/Log.js';
import { requireAuth } from '../middleware/auth.js';
import { privacyGuard } from '../lib/privacy.js';

const router = Router();
router.use(requireAuth, privacyGuard());

/** Appends to the history. Never fails the change it describes. */
export const log = (owner, entry) => Log.create({ owner, ...entry }).catch((e) => console.error('[log]', e.message));

// Newest first, 50 at a time: ?before=<`next` from the previous page>.
// The cursor is the last entry's id, so entries sharing a timestamp are never skipped.
// An ISO date is still accepted as a cursor (older clients).
router.get('/', async (req, res) => {
  const limit = 50;
  const before = req.query.before ? String(req.query.before) : null;
  const filter = { owner: req.userId };
  if (before && mongoose.isValidObjectId(before)) filter._id = { $lt: before };
  else if (before && !isNaN(new Date(before))) filter.createdAt = { $lt: new Date(before) };
  const rows = await Log.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const items = rows.slice(0, limit);
  res.json({ items, next: rows.length > limit ? items.at(-1).id : null });
});

export default router;
