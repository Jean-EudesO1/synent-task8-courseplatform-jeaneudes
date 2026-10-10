import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },
    razorpayPaymentId: {
      type: String,
      unique: true,
      sparse: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    currency: {
      type: String,
      required: true,
      enum: ['INR'],
    },
    status: {
      type: String,
      required: true,
      enum: ['created', 'authorized', 'captured'],
      default: 'created',
      index: true,
    },
    capturedAt: Date,
  },
  { timestamps: true },
)

paymentSchema.index({ userId: 1, courseId: 1, status: 1 })
paymentSchema.index(
  { userId: 1, courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['created', 'authorized'] } },
  },
)

export default mongoose.model('Payment', paymentSchema)
