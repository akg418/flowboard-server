import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Item from '../models/Item.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

export function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return 'Username and password are required';
  if (username.trim().length < 3) return 'Username must be at least 3 characters';
  if (/^\d/.test(username.trim())) return "Username can't start with a number";
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const error = validateCredentials(username, password);
  if (error) return res.status(400).json({ error });

  const name = username.trim();
  if (await User.exists({ usernameKey: name.toLowerCase() }))
    return res.status(409).json({ error: 'That username is taken' });

  const isFirst = (await User.estimatedDocumentCount()) === 0;
  const user = await User.create({
    username: name,
    usernameKey: name.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    lastSeenAt: new Date(),
  });
  // The first account adopts items created before accounts existed.
  if (isFirst) await Item.updateMany({ owner: null }, { owner: user._id });

  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Username and password are required' });
  const user = await User.findOne({ usernameKey: username.trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Wrong username or password' });
  await User.updateOne({ _id: user._id }, { lastSeenAt: new Date() });
  res.json({ token: signToken(user), user });
});

// Privacy mode on: no password needed. Off: needs the password (403 if wrong; the session stays valid).
router.put('/privacy', requireAuth, async (req, res) => {
  const { on, password } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  if (!on && (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))))
    return res.status(403).json({ error: 'Wrong password' });
  user.privacy = !!on;
  await user.save();
  res.json(user);
});

router.get('/me', requireAuth, async (req, res) => {
  // Runs on every app open, so it doubles as "last seen".
  const user = await User.findByIdAndUpdate(req.userId, { lastSeenAt: new Date() });
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json({ user });
});

export default router;
