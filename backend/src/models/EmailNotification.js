import mongoose from 'mongoose'

const emailNotificationSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['course-enrollment', 'test'],
      required: true,
    },
    recipient: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastErrorCode: {
      type: String,
      maxlength: 80,
    },
    sentAt: Date,
  },
  { timestamps: true },
)

emailNotificationSchema.index({ status: 1, updatedAt: 1 })

export default mongoose.model('EmailNotification', emailNotificationSchema)
