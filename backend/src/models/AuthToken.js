import mongoose from 'mongoose'

const authTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['email-verification', 'password-reset'],
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 60 * 60 * 24 * 30 },
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
)

export default mongoose.model('AuthToken', authTokenSchema)
