import { Router } from 'express';
import mongoose from 'mongoose';
import Item from '../models/Item.js';
import { requireAuth } from '../middleware/auth.js';
import { log } from './logs.js';
import { privacyGuard } from '../lib/privacy.js';
import { spawnMissed, spawnNext } from '../lib/recur.js';

const router = Router();
router.use(requireAuth);
// Folding a row open / closed is view state, so it's allowed in privacy mode.
router.use(privacyGuard((req) => req.method === 'PATCH' && Object.keys(req.body || {}).every((k) => k === 'collapsed')));

const EDITABLE = [
  'title', 'description', 'kind', 'parent', 'order', 'done', 'someday',
  'start', 'end', 'allDay', 'remindBefore', 'dependsOn', 'color', 'collapsed',
  'inProgress', 'timeSpent', 'timerStartedAt', 'repeat', 'series', 'nextSpawned',
];

const pick = (body) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k)));

const isId = (id) => mongoose.isValidObjectId(id);

async function descendantIds(owner, rootId) {
  const all = await Item.find({ owner }, { parent: 1 }).lean();
  const byParent = new Map();
  for (const it of all) {
    const p = it.parent ? it.parent.toString() : null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(it._id.toString());
  }
  const out = [];
  const stack = [rootId.toString()];
  while (stack.length) {
    const kids = byParent.get(stack.pop()) || [];
    out.push(...kids);
    stack.push(...kids);
  }
  return out;
}

// True if `targetId` is reachable from `fromIds` by following dependsOn.
async function dependsReach(owner, fromIds, targetId) {
  const all = await Item.find({ owner }, { dependsOn: 1 }).lean();
  const deps = new Map(all.map((i) => [i._id.toString(), i.dependsOn.map(String)]));
  const seen = new Set();
  const stack = fromIds.map(String);
  while (stack.length) {
    const id = stack.pop();
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(deps.get(id) || []));
  }
  return false;
}

// Referenced items must exist and belong to the same user.
const allOwned = async (owner, ids) => (await Item.countDocuments({ owner, _id: { $in: ids } })) === new Set(ids).size;

async function validate(owner, id, data) {
  if (data.parent) {
    if (!isId(data.parent) || !(await allOwned(owner, [data.parent]))) return 'Invalid parent';
    if (id && (data.parent === id || (await descendantIds(owner, id)).includes(data.parent)))
      return 'Cannot move an item inside itself';
  }
  if (data.dependsOn) {
    if (!Array.isArray(data.dependsOn) || !data.dependsOn.every(isId) || !(await allOwned(owner, data.dependsOn)))
      return 'Invalid dependency';
    if (id && (data.dependsOn.includes(id) || (await dependsReach(owner, data.dependsOn, id))))
      return 'That dependency would create a cycle';
  }
  return null;
}

router.get('/', async (req, res) => {
  await spawnMissed(req.userId);
  const items = await Item.find({ owner: req.userId }).sort({ order: 1, createdAt: 1 });
  res.json(items);
});

router.post('/', async (req, res) => {
  const data = pick(req.body);
  const error = await validate(req.userId, null, data);
  if (error) return res.status(400).json({ error });
  if (data.order === undefined) {
    const last = await Item.findOne({ owner: req.userId, parent: data.parent || null }).sort({ order: -1 });
    data.order = last ? last.order + 1 : 0;
  }
  if (data.done) data.completedAt = new Date();
  const item = await Item.create({ ...data, owner: req.userId });
  await log(req.userId, { action: 'create', itemId: item._id, title: item.title, kind: item.kind });
  res.status(201).json(item);
});

// Bulk move/reorder after drag & drop: [{ id, parent, order }]
router.put('/reorder', async (req, res) => {
  const moves = Array.isArray(req.body.moves) ? req.body.moves : [];
  for (const m of moves) {
    if (!isId(m.id)) return res.status(400).json({ error: 'Invalid id' });
    const error = await validate(req.userId, m.id, { parent: m.parent });
    if (error) return res.status(400).json({ error });
  }
  if (!(await allOwned(req.userId, moves.map((m) => m.id)))) return res.status(404).json({ error: 'Not found' });
  await Item.bulkWrite(
    moves.map((m) => ({
      updateOne: { filter: { _id: m.id, owner: req.userId }, update: { parent: m.parent || null, order: m.order } },
    }))
  );
  if (moves.length) {
    const first = await Item.findById(moves[0].id, { title: 1, kind: 1 });
    await log(req.userId, { action: 'move', itemId: first?._id, title: first?.title, kind: first?.kind, count: moves.length });
  }
  res.json({ ok: true });
});

// Undo/redo: writes back whole item snapshots (keeping their ids) and removes others.
// Body: { upsert: [item], remove: [id] }
router.put('/sync', async (req, res) => {
  const upsert = Array.isArray(req.body.upsert) ? req.body.upsert : [];
  const remove = Array.isArray(req.body.remove) ? req.body.remove : [];
  if (![...upsert.map((i) => i?.id), ...remove].every(isId)) return res.status(400).json({ error: 'Invalid id' });
  // Every id must be new or already this user's.
  const ids = [...upsert.map((i) => i.id), ...remove];
  if (await Item.exists({ _id: { $in: ids }, owner: { $ne: req.userId } })) return res.status(404).json({ error: 'Not found' });

  if (remove.length) {
    const all = [...new Set([...remove, ...(await Promise.all(remove.map((id) => descendantIds(req.userId, id)))).flat()])];
    await Item.deleteMany({ owner: req.userId, _id: { $in: all } });
  }
  if (upsert.length)
    await Item.bulkWrite(
      upsert.map((doc) => {
        const data = { ...pick(doc), owner: req.userId, completedAt: doc.completedAt ?? null };
        if (doc.createdAt) data.createdAt = doc.createdAt;
        return { replaceOne: { filter: { _id: doc.id, owner: req.userId }, replacement: data, upsert: true } };
      })
    );
  // Undo/redo say what they reverted: { log: { action: 'undo' | 'redo', label } }
  const step = req.body.log;
  if (step && ['undo', 'redo'].includes(step.action))
    await log(req.userId, { action: step.action, title: String(step.label || '').slice(0, 300), itemId: upsert[0]?.id || remove[0] || null });
  res.json({ ok: true });
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = pick(req.body);
  const error = await validate(req.userId, id, data);
  if (error) return res.status(400).json({ error });
  if ('done' in data) data.completedAt = data.done ? new Date() : null;
  const item = await Item.findOneAndUpdate({ _id: id, owner: req.userId }, data, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ error: 'Not found' });
  const fields = Object.keys(data).filter((k) => !['collapsed', 'completedAt', 'order'].includes(k));
  if (fields.length) {
    const action =
      data.done === true ? 'done' : data.done === false && fields.length === 1 ? 'reopen'
      : data.inProgress === true ? 'start' : data.inProgress === false && 'timerStartedAt' in data ? 'pause'
      : 'edit';
    await log(req.userId, { action, itemId: item._id, title: item.title, kind: item.kind, fields });
  }
  if (data.done === true) await spawnNext(item); // finishing a repeating item lines up the next one
  res.json(item);
});

// Deletes the item with its whole subtree and unlinks it from dependencies.
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });
  if (!(await allOwned(req.userId, [id]))) return res.status(404).json({ error: 'Not found' });
  const ids = [id, ...(await descendantIds(req.userId, id))];
  const gone = await Item.findById(id, { title: 1, kind: 1 });
  await Item.deleteMany({ owner: req.userId, _id: { $in: ids } });
  await log(req.userId, { action: 'delete', itemId: gone._id, title: gone.title, kind: gone.kind, count: ids.length });
  await Item.updateMany({ owner: req.userId, dependsOn: { $in: ids } }, { $pull: { dependsOn: { $in: ids } } });
  res.json({ deleted: ids });
});

export default router;
