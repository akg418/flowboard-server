import mongoose from 'mongoose';

const { Schema } = mongoose;

// Activity history: one entry per change, kept after the item itself is gone.
const LogSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // create | edit | done | reopen | start | pause | move | delete | undo | redo
    itemId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, default: '' },
    kind: { type: String, default: 'task' },
    fields: [{ type: String }], // what an edit changed
    count: { type: Number, default: 1 }, // items moved / deleted together
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
LogSchema.index({ owner: 1, _id: -1 });

LogSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.owner;
    return ret;
  },
});

export default mongoose.model('Log', LogSchema);
