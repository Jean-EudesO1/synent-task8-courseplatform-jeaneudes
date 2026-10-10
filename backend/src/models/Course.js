import mongoose from 'mongoose'

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    durationMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
    videoUrl: {
      type: String,
      select: false,
      default: '',
    },
    content: {
      type: String,
      select: false,
      default: '',
    },
  },
)

const moduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    lessons: {
      type: [lessonSchema],
      default: [],
    },
  },
)

const courseSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    level: {
      type: String,
      required: true,
      enum: ['Débutant', 'Intermédiaire', 'Avancé'],
      index: true,
    },
    image: {
      type: String,
      required: true,
      default: '/courses/course-placeholder.svg',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    currency: {
      type: String,
      required: true,
      enum: ['INR'],
      default: 'INR',
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    modules: {
      type: [moduleSchema],
      default: [],
    },
  },
  { timestamps: true },
)

courseSchema.index({ status: 1, title: 1 })

export default mongoose.model('Course', courseSchema)
