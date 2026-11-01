// Repeating items: each occurrence is its own item. When one is finished, or its time
// passes unfinished (it stays behind as overdue), the next one is created once.
import Item from '../models/Item.js';
import { log } from '../routes/logs.js';

/** Date arithmetic in the server's local time zone (set TZ to match the users'), so "every Thursday 5pm" survives DST. */
function step(date, { every, interval = 1 }) {
  const d = new Date(date);
  if (every === 'day') d.setDate(d.getDate() + interval);
  else if (every === 'week') d.setDate(d.getDate() + 7 * interval);
  else if (every === 'month') d.setMonth(d.getMonth() + interval);
  else d.setFullYear(d.getFullYear() + interval);
  return d;
}

/** First occurrence after this one that is also in the future. */
export function nextStart(item, now = new Date()) {
  let d = step(item.start, item.repeat);
  for (let i = 0; d <= now && i < 5000; i++) d = step(d, item.repeat);
  return d;
}

/** Past its time: timed items once they start, all-day items once their day is over. */
export function isMissed(item, now = new Date()) {
  if (!item.start) return false;
  if (!item.allDay) return new Date(item.start) < now;
  const end = new Date(item.start);
  end.setDate(end.getDate() + 1);
  return end <= now;
}

/** Creates the next occurrence of `item` (once). Returns it, or null. */
export async function spawnNext(item) {
  if (!item.repeat?.every || !item.start || item.nextSpawned) return null;
  const series = item.series || item._id;
  const start = nextStart(item);
  await Item.updateOne({ _id: item._id }, { nextSpawned: true });
  // An undo can clear nextSpawned on an item whose successor already exists: don't make two.
  if (await Item.exists({ owner: item.owner, series, start })) return null;
  if (!item.series) await Item.updateOne({ _id: item._id }, { series });
  const length = item.end ? new Date(item.end) - new Date(item.start) : null;
  const next = await Item.create({
    owner: item.owner,
    title: item.title,
    description: item.description,
    kind: item.kind,
    parent: item.parent,
    order: item.order,
    start,
    end: length != null ? new Date(start.getTime() + length) : null,
    allDay: item.allDay,
    remindBefore: item.remindBefore,
    color: item.color,
    repeat: item.repeat,
    series,
  });
  await log(item.owner, { action: 'create', itemId: next._id, title: next.title, kind: next.kind });
  return next;
}

/** Catches up every repeating item of `owner` whose time passed without a successor. */
export async function spawnMissed(owner, now = new Date()) {
  const due = await Item.find({ owner, 'repeat.every': { $ne: null }, nextSpawned: { $ne: true }, start: { $ne: null, $lt: now } });
  let made = 0;
  for (const it of due) if ((it.done || isMissed(it, now)) && (await spawnNext(it))) made++;
  return made;
}
