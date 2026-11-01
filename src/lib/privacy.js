// Privacy mode: while a user has it on, every response carries dummy titles, notes, dates
// and times, and nothing can be changed — on any device, until it's turned off with the password.
import User from '../models/User.js';

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const pick = (arr, h) => arr[h % arr.length];

const WORDS = ['Test', 'Dummy', 'Sample', 'Demo', 'Example', 'Mock', 'Placeholder', 'Draft'];
const NOUNS = ['task', 'item', 'entry', 'todo', 'check', 'step', 'note', 'record'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Omega', 'Sigma', 'Kappa'];
const LOREM = ['Lorem ipsum', 'Dolor sit amet', 'Consectetur', 'Adipiscing elit', 'Sed do eiusmod', 'Tempor incididunt'];

/** Same id → same dummy title, every time. */
export function fakeTitle(id, kind = 'task') {
  const h = hash(String(id || '?'));
  const n = ((h >>> 8) % 90) + 10;
  const w = pick(WORDS, h >>> 3);
  switch (kind) {
    case 'project':
      return [`${w} project ${pick(GREEK, h >>> 5)}`, `Project ${pick(GREEK, h >>> 5)}-${n}`, `${w} workspace ${n}`][h % 3];
    case 'meeting':
      return [`${w} meeting #${n}`, `Sync call ${n}`, `Test meeting ${pick(GREEK, h >>> 5)}`][h % 3];
    case 'session':
      return `Work session ${n}`;
    default:
      return [`${w} ${pick(NOUNS, h >>> 6)} ${n}`, `${pick(LOREM, h >>> 4)} ${n}`, `Task #${n}-${((h >>> 12) % 9) + 1}`, `${w} ${n}`][h % 4];
  }
}

const DAY = 864e5;

/** Moves a date by a stable, made-up offset: a different day and a different clock time. */
function fakeDate(value, h, allDay) {
  if (!value) return value;
  const d = new Date(new Date(value).getTime() + (((h >>> 9) % 25) - 12) * DAY);
  if (!allDay) d.setUTCHours(((h >>> 13) % 11) + 6, pick([0, 15, 30, 45], h >>> 17), 0, 0);
  return d.toISOString();
}

function maskItem(it) {
  const h = hash(String(it.id));
  const start = fakeDate(it.start, h, it.allDay);
  const length = it.start && it.end ? new Date(it.end) - new Date(it.start) : 0;
  return {
    ...it,
    title: fakeTitle(it.id, it.kind),
    description: it.description ? '<p>Lorem ipsum dolor sit amet — dummy notes for testing.</p>' : '',
    start,
    end: it.end ? new Date(new Date(start).getTime() + (h % 4 ? length : length + 30 * 6e4)).toISOString() : it.end,
    completedAt: fakeDate(it.completedAt, h >>> 3, false),
    remindBefore: it.remindBefore == null ? null : pick([5, 10, 15, 30, 60], h >>> 4),
    timeSpent: it.timeSpent ? ((h >>> 6) % 36) * 300 + 60 : 0,
  };
}

const maskLog = (l) => ({ ...l, title: l.title ? fakeTitle(l.itemId || l.id, l.kind) : l.title });

const maskNote = (n) => ({ ...n, title: `Sample note ${(hash(n.id) % 90) + 10}`, content: '<p>Lorem ipsum dolor sit amet — dummy note for testing.</p>' });

/** Rewrites a JSON body: items (have `kind` + `order`), notes (have `content`) and log rows (have `action`). */
function maskBody(body) {
  const one = (x) =>
    x && typeof x === 'object'
      ? 'action' in x ? maskLog(x) : 'order' in x && 'kind' in x ? maskItem(x) : 'content' in x ? maskNote(x) : x
      : x;
  if (Array.isArray(body)) return body.map(one);
  if (body && Array.isArray(body.items)) return { ...body, items: body.items.map(one) };
  return one(body);
}

/**
 * For item / log routes. In privacy mode: responses are masked, and only reads
 * (plus folding a row open / closed, `allow`) get through.
 */
export const privacyGuard = (allow = () => false) => async (req, res, next) => {
  const user = await User.findById(req.userId, { privacy: 1 }).lean();
  if (!user?.privacy) return next();
  if (req.method !== 'GET' && !allow(req))
    return res.status(423).json({ error: 'Privacy mode is on — nothing can be added, changed or deleted.' });
  const json = res.json.bind(res);
  res.json = (body) => json(res.statusCode < 400 ? maskBody(JSON.parse(JSON.stringify(body))) : body);
  next();
};
