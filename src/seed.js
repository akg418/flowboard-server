// Sample data for the `demo` account (password `demo123`): `npm run seed`.
// Only resets the demo user's items; other accounts are untouched.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Item from './models/Item.js';
import User from './models/User.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/flowboard');
const demo =
  (await User.findOne({ usernameKey: 'demo' })) ||
  (await User.create({ username: 'demo', usernameKey: 'demo', passwordHash: await bcrypt.hash('demo123', 10) }));
await Item.deleteMany({ owner: demo._id });

const at = (days, h = null, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h ?? 0, h == null ? 0 : m, 0, 0);
  return { start: d, allDay: h == null };
};
const add = (data) => Item.create({ ...data, owner: demo._id });

const web = await add({ title: 'Website redesign', kind: 'project', color: '#6f5cef', order: 0 });
const research = await add({ title: 'Research & wireframes', parent: web.id, order: 0, done: true });
const design = await add({ title: 'Design system', kind: 'project', parent: web.id, order: 1, color: '#0ea5e9' });
const colors = await add({ title: 'Pick color palette', parent: design.id, order: 0, done: true, dependsOn: [research.id] });
const comps = await add({ title: 'Build components', parent: design.id, order: 1, dependsOn: [colors.id], ...at(1, 11) , remindBefore: 0 });
const landing = await add({ title: 'Landing page', parent: web.id, order: 2, dependsOn: [comps.id], ...at(3) });
await add({ title: 'Launch 🚀', parent: web.id, order: 3, dependsOn: [landing.id], ...at(7) });

const app = await add({ title: 'تطبيق الموبايل', kind: 'project', color: '#10b981', order: 1 });
await add({ title: 'تصميم الشاشات', parent: app.id, order: 0, description: 'Home, details, calendar' });
await add({ title: 'ربط الـ API', parent: app.id, order: 1 });

await add({ title: 'ميتينج مع العميل', kind: 'meeting', order: 2, ...at(0, 17), remindBefore: 10 });
await add({ title: 'Gym', order: 3, ...at(0, 20), remindBefore: 0 });
await add({ title: 'اتصل بالبنك', order: 4, ...at(-1) });
await add({ title: 'Weekly sync', kind: 'meeting', order: 5, ...at(2, 10), remindBefore: 10 });
await add({ title: 'Read “Refactoring UI”', someday: true, order: 6 });
await add({ title: 'تعلم Rust', someday: true, order: 7, description: 'ابدأ بالـ Book الرسمي' });

console.log('Seeded', await Item.countDocuments({ owner: demo._id }), 'items for demo / demo123');
await mongoose.disconnect();
