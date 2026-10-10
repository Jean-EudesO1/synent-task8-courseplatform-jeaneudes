import mongoose from 'mongoose'
import Course from '../models/Course.js'

const publicCourseFields = [
  'title',
  'description',
  'category',
  'level',
  'image',
  'price',
  'currency',
  'modules._id',
  'modules.title',
  'modules.lessons._id',
  'modules.lessons.title',
  'modules.lessons.durationMinutes',
].join(' ')

function publicCourse(course) {
  return {
    id: String(course._id),
    title: course.title,
    description: course.description,
    category: course.category,
    level: course.level,
    image: course.image,
    price: course.price,
    currency: course.currency,
    modules: course.modules.map((module) => ({
      id: String(module._id),
      title: module.title,
      lessons: module.lessons.map((lesson) => ({
        id: String(lesson._id),
        title: lesson.title,
        durationMinutes: lesson.durationMinutes,
      })),
    })),
  }
}

export async function listCourses(request, response, next) {
  try {
    const { q, category, level, page, limit } = request.validatedCourseQuery
    const filter = { status: 'published' }

    if (q) {
      const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { title: { $regex: escapedQuery, $options: 'i' } },
        { description: { $regex: escapedQuery, $options: 'i' } },
      ]
    }
    if (category) filter.category = category
    if (level) filter.level = level

    const [courses, total, categories] = await Promise.all([
      Course.find(filter)
        .select(publicCourseFields)
        .sort({ title: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Course.countDocuments(filter),
      Course.distinct('category', { status: 'published' }),
    ])

    return response.json({
      courses: courses.map(publicCourse),
      categories: categories.sort((left, right) => left.localeCompare(right, 'fr')),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return next(error)
  }
}

export async function getCourse(request, response, next) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ message: 'Identifiant de cours invalide.' })
  }

  try {
    const course = await Course.findOne({
      _id: request.params.id,
      status: 'published',
    })
      .select(publicCourseFields)
      .lean()

    if (!course) {
      return response.status(404).json({ message: 'Cours introuvable.' })
    }

    return response.json({ course: publicCourse(course) })
  } catch (error) {
    return next(error)
  }
}
