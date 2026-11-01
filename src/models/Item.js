import mongoose from 'mongoose';

const { Schema } = mongoose;

// "Every 2 weeks" = { every: 'week', interval: 2 }. Weekly items repeat on their start's weekday.
const RepeatSchema = new Schema(
  {
    every: { type: String, enum: ['day', 'week', 'month', 'year'], required: true },
    interval: { type: Number, min: 1, max: 365, default: 1 },
  },
  { _id: false }
);

// One collection for everything: tasks, projects and meetings form a tree via `parent`.
const ItemSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    kind: { type: String, enum: ['task', 'project', 'meeting', 'session'], default: 'task' },
    parent: { type: Schema.Types.ObjectId, ref: 'Item', default: null, index: true },
    order: { type: Number, default: 0 },
    done: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    someday: { type: Boolean, default: false },
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    remindBefore: { type: Number, default: null }, // minutes; null = no reminder
    dependsOn: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
    color: { type: String, default: null },
    collapsed: { type: Boolean, default: false },
    // Time tracking: running while timerStartedAt is set; timeSpent holds finished stretches (seconds).
    inProgress: { type: Boolean, default: false },
    timeSpent: { type: Number, default: 0, min: 0 },
    timerStartedAt: { type: Date, default: null },
    // Repeating: every occurrence is its own item, linked by `series` (the first one's id).
    repeat: { type: RepeatSchema, default: null },
    series: { type: Schema.Types.ObjectId, default: null, index: true },
    nextSpawned: { type: Boolean, default: false }, // its next occurrence was already created
  },
  { timestamps: true }
);

ItemSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.owner;
    return ret;
  },
});

export default mongoose.model('Item', ItemSchema);
