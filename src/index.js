import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import items from './routes/items.js';
import auth from './routes/auth.js';
import logs from './routes/logs.js';
import notes from './routes/notes.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set (see .env.example)');

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/flowboard';

const app = express();
const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(origins?.length ? { origin: origins } : undefined));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api/items', items);
app.use('/api/logs', logs);
app.use('/api/notes', notes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

await mongoose.connect(MONGO_URI);
app.listen(PORT, '0.0.0.0', () => console.log(`API on http://localhost:${PORT}`));
