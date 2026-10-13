import mongoose from 'mongoose'

const enrollmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required() {
        return this.source === 'payment'
      },
    },
    source: {
      type: String,
      enum: ['payment', 'development-test'],
      default: 'payment',
      required: true,
    },
    completedLessonIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
      }],
      default: [],
    },
    enrolledAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true },
)

enrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true })
enrollmentSchema.index({ courseId: 1 })

export default mongoose.model('Enrollment', enrollmentSchema)
