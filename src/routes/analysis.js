import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import User from '../models/User.js';
import Item from '../models/Item.js';
import Note from '../models/Note.js';

const router = Router();
const digest = (s) => createHash('sha256').update(String(s)).digest();
const PAGE = 20;

// Owner-only stats, gated by ANALYSIS_PASSWORD (disabled when unset).
async function checkPassword(req, res, next) {
  const secret = process.env.ANALYSIS_PASSWORD;
  if (!secret) return res.status(404).json({ error: 'Not found' });
  if (!timingSafeEqual(digest(req.body?.password), digest(secret))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return res.status(403).json({ error: 'Wrong password' });
  }
  next();
}

// `since`: start of "today" in the viewer's timezone (ISO); defaults to the server's midnight.
router.post('/', checkPassword, async (req, res) => {
  let since = new Date(req.body.since);
  if (isNaN(since)) (since = new Date()).setHours(0, 0, 0, 0);
  const [users, projects, tasks, notes, activeToday] = await Promise.all([
    User.estimatedDocumentCount(),
    Item.countDocuments({ kind: 'project' }),
    Item.countDocuments({ kind: { $ne: 'project' } }),
    Note.estimatedDocumentCount(),
    User.countDocuments({ lastSeenAt: { $gte: since } }),
  ]);
  res.json({ users, projects, tasks, notes, activeToday });
});

// Newest users first, PAGE at a time; pass the returned `next` as `cursor` for the following page.
router.post('/users', checkPassword, async (req, res) => {
  const { cursor } = req.body;
  const filter = mongoose.isValidObjectId(cursor) ? { _id: { $lt: cursor } } : {};
  const docs = await User.find(filter, { username: 1, createdAt: 1, lastSeenAt: 1 }).sort({ _id: -1 }).limit(PAGE + 1).lean();
  const page = docs.slice(0, PAGE);
  const counts = await Item.aggregate([
    { $match: { owner: { $in: page.map((u) => u._id) }, kind: { $ne: 'project' } } },
    { $group: { _id: '$owner', n: { $sum: 1 } } },
  ]);
  const tasks = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    users: page.map((u) => ({
      id: String(u._id),
      username: u.username,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      tasks: tasks.get(String(u._id)) || 0,
    })),
    next: docs.length > PAGE ? String(page.at(-1)._id) : null,
  });
});

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_';
const randomPassword = () => Array.from({ length: randomInt(10, 16) }, () => CHARS[randomInt(CHARS.length)]).join('');

// Sets a random 10–15 character password and returns it once, in plain text, to the owner.
router.post('/users/:id/reset-password', checkPassword, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const password = randomPassword();
  const user = await User.findByIdAndUpdate(req.params.id, { passwordHash: await bcrypt.hash(password, 10) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ password });
});

export default router;
