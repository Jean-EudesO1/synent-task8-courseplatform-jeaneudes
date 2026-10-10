import mongoose from 'mongoose'
import Course from '../models/Course.js'
import Enrollment from '../models/Enrollment.js'

function slugFromTitle(title) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'cours'
}

function validId(id) {
  return mongoose.isValidObjectId(id)
}

function handleError(error, response, next) {
  if (error.code === 11000) {
    return response.status(409).json({ message: 'Un cours utilise déjà cet identifiant ou ce slug.' })
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(400).json({ message: 'Les données du cours sont invalides.' })
  }
  return next(error)
}

export async function listAdminCourses(_request, response, next) {
  try {
    const courses = await Course.find({})
      .select('+modules.lessons.videoUrl +modules.lessons.content')
      .sort({ updatedAt: -1, _id: 1 })
      .lean()
    const courseIds = courses.map((course) => course._id)
    const enrollmentCounts = await Enrollment.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ])
    const counts = new Map(enrollmentCounts.map(({ _id, count }) => [String(_id), count]))
    return response.json({
      courses: courses.map((course) => ({
        ...course,
        enrollmentCount: counts.get(String(course._id)) || 0,
      })),
    })
  } catch (error) {
    return next(error)
  }
}

export async function createAdminCourse(request, response, next) {
  try {
    const data = request.validatedCourse
    const course = await Course.create({
      ...data,
      slug: `${slugFromTitle(data.title)}-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    })
    return response.status(201).json({ course })
  } catch (error) {
    return handleError(error, response, next)
  }
}

export async function updateAdminCourse(request, response, next) {
  if (!validId(request.params.id)) {
    return response.status(400).json({ message: 'Identifiant de cours invalide.' })
  }
  try {
    const course = await Course.findById(request.params.id)
      .select('+modules.lessons.videoUrl +modules.lessons.content')
    if (!course) return response.status(404).json({ message: 'Cours introuvable.' })

    const previousModules = new Map(course.modules.map((module) => [String(module._id), module]))
    const updatedModules = request.validatedCourse.modules.map((module) => {
      const previousModule = module._id ? previousModules.get(String(module._id)) : null
      const previousLessons = new Map(
        (previousModule?.lessons || []).map((lesson) => [String(lesson._id), lesson]),
      )
      return {
        ...(module._id && previousModule ? { _id: module._id } : {}),
        title: module.title,
        lessons: module.lessons.map((lesson) => ({
          ...(lesson._id && previousLessons.has(String(lesson._id))
            ? { _id: lesson._id }
            : {}),
          title: lesson.title,
          durationMinutes: lesson.durationMinutes,
          videoUrl: lesson.videoUrl,
          content: lesson.content,
        })),
      }
    })
    course.set({
      ...request.validatedCourse,
      modules: updatedModules,
    })
    await course.save()
    return response.json({ course })
  } catch (error) {
    return handleError(error, response, next)
  }
}

export async function deleteAdminCourse(request, response, next) {
  if (!validId(request.params.id)) {
    return response.status(400).json({ message: 'Identifiant de cours invalide.' })
  }
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      const enrollmentCount = await Enrollment.countDocuments({
        courseId: request.params.id,
      }).session(session)
      if (enrollmentCount) {
        const error = new Error('Ce cours possède des inscriptions et ne peut pas être supprimé. Archivez-le pour le retirer du catalogue.')
        error.status = 409
        throw error
      }
      const course = await Course.findOneAndDelete({
        _id: request.params.id,
        enrollmentCount: { $in: [0, null] },
      }, { session })
      result = course ? 'deleted' : 'missing'
    })
    if (result === 'missing') return response.status(404).json({ message: 'Cours introuvable.' })
    return response.status(204).end()
  } catch (error) {
    if (error.status === 409) return response.status(409).json({ message: error.message })
    return next(error)
  } finally {
    await session.endSession()
  }
}

export async function archiveAdminCourse(request, response, next) {
  if (!validId(request.params.id)) {
    return response.status(400).json({ message: 'Identifiant de cours invalide.' })
  }
  try {
    const course = await Course.findByIdAndUpdate(
      request.params.id,
      { $set: { status: 'archived' } },
      { returnDocument: 'after', runValidators: true },
    )
    if (!course) return response.status(404).json({ message: 'Cours introuvable.' })
    return response.json({ course, message: 'Le cours a été archivé.' })
  } catch (error) {
    return handleError(error, response, next)
  }
}
