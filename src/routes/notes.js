import { Router } from 'express';
import mongoose from 'mongoose';
import Note from '../models/Note.js';
import { requireAuth } from '../middleware/auth.js';
import { privacyGuard } from '../lib/privacy.js';

const router = Router();
router.use(requireAuth, privacyGuard());

const pick = (b) => ({
  ...(typeof b.title === 'string' && { title: b.title }),
  ...(typeof b.content === 'string' && { content: b.content }),
});
const isId = (id) => mongoose.isValidObjectId(id);

router.get('/', async (req, res) => {
  res.json(await Note.find({ owner: req.userId }).sort({ updatedAt: -1 }));
});

router.post('/', async (req, res) => {
  res.status(201).json(await Note.create({ ...pick(req.body || {}), owner: req.userId }));
});

router.patch('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const note = await Note.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, pick(req.body || {}), { returnDocument: 'after' });
  if (!note) return res.status(404).json({ error: 'Not found' });
  res.json(note);
});

router.delete('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const r = await Note.deleteOne({ _id: req.params.id, owner: req.userId });
  if (!r.deletedCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
