# Flowboard API

Express + MongoDB backend for Flowboard (tasks, projects, meetings as one tree).

## Run

```bash
cp .env.example .env
npm install
npm run seed   # optional: resets sample data for account demo / demo123
npm run dev    # http://localhost:4000
```

## Auth

Username (min 3 chars, can't start with a digit, case-insensitive unique) + password (min 6, bcrypt-hashed). Login returns a JWT (30 days); send it as `Authorization: Bearer <token>` on all `/api/items` calls. Each user only sees their own items. The first account to register adopts items created before accounts existed.

| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/register` | `{ username, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ username, password }` → `{ token, user }` |
| GET | `/api/auth/me` | – |
| PUT | `/api/auth/privacy` | `{ on: true }`, or `{ on: false, password }` → `user` (403 on a wrong password) |

**Privacy mode** is stored on the user (`user.privacy`). While it's on, `/api/items` and `/api/logs` return dummy titles, notes, dates and times (stable per item), and every write is refused with `423` — except a `PATCH` that only changes `collapsed`. It stays on across devices until turned off with the password.

## API

| Method | Path | Body |
|---|---|---|
| GET | `/api/items` | – (returns all items) |
| POST | `/api/items` | item fields |
| PATCH | `/api/items/:id` | partial item |
| DELETE | `/api/items/:id` | – (deletes subtree, unlinks dependencies) |
| PUT | `/api/items/reorder` | `{ moves: [{ id, parent, order }] }` |

Item: `title, description, kind (task|project|meeting|session), parent, order, done, someday, start, end, allDay, remindBefore (min), dependsOn[], color, collapsed, inProgress, timeSpent, timerStartedAt, repeat, series, nextSpawned`.

**Repeating items** have `repeat: { every: 'day'|'week'|'month'|'year', interval }`. Each occurrence is its own item, linked by `series`. When one is marked done, or its time passes unfinished (it stays as overdue), the server creates the next future occurrence once (`nextSpawned`). Missed ones are caught up on `GET /api/items`. Dates step in the server's local time zone, so set `TZ` to the users' zone (e.g. `TZ=Africa/Cairo`).

Rejects moves into an item's own subtree and dependency cycles (400).
