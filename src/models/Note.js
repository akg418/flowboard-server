import mongoose from 'mongoose';

const { Schema } = mongoose;

// Free-standing notes (the Notes tab). Their HTML can mention tasks, projects and other notes.
const NoteSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: '', trim: true },
    content: { type: String, default: '' },
  },
  { timestamps: true }
);

NoteSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.owner;
    return ret;
  },
});

export default mongoose.model('Note', NoteSchema);
