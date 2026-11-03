import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    // Lowercased copy so "Ahmed" and "ahmed" can't both register.
    usernameKey: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    // Privacy mode: dummy data and read-only on every device until turned off with the password.
    privacy: { type: Boolean, default: false },
    // Last sign-in or app open (set by /auth/me); for /analysis.
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.set('toJSON', {
  transform: (_doc, ret) => ({ id: ret._id.toString(), username: ret.username, privacy: !!ret.privacy, createdAt: ret.createdAt }),
});

export default mongoose.model('User', UserSchema);
