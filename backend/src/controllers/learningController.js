import mongoose from 'mongoose'
import Course from '../models/Course.js'
import Enrollment from '../models/Enrollment.js'

function progressFor(course, completedLessonIds) {
  const lessonIds = course.modules.flatMap((module) =>
    module.lessons.map((lesson) => String(lesson._id)))
  const currentLessonIds = new Set(lessonIds)
  const completedIds = [...new Set(completedLessonIds.map(String))]
    .filter((id) => currentLessonIds.has(id))
  return {
    completedLessonIds: completedIds,
    completedCount: completedIds.length,
    totalCount: lessonIds.length,
    percentage: lessonIds.length
      ? Math.round((completedIds.length / lessonIds.length) * 100)
      : 0,
  }
}

function addMissingSubdocumentIds(modules = []) {
  let changed = false
  const stableModules = modules.map((module) => {
    let moduleChanged = !mongoose.isValidObjectId(module._id)
    const moduleId = mongoose.isValidObjectId(module._id)
      ? module._id
      : new mongoose.Types.ObjectId()
    const lessons = (module.lessons || []).map((lesson) => {
      if (mongoose.isValidObjectId(lesson._id)) return lesson
      moduleChanged = true
      return { ...lesson, _id: new mongoose.Types.ObjectId() }
    })

    if (!moduleChanged) return module
    changed = true
    return { ...module, _id: moduleId, lessons }
  })
  return { modules: stableModules, changed }
}

async function findCourseWithStableSubdocumentIds(courseId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const course = await Course.findById(courseId)
      .select('+modules.lessons.videoUrl +modules.lessons.content')
      .lean()
    if (!course) return null

    const result = addMissingSubdocumentIds(course.modules)
    if (!result.changed) return course

    const versionFilter = Object.hasOwn(course, '__v')
      ? { __v: course.__v }
      : { __v: { $exists: false } }
    const update = await Course.collection.updateOne(
      { _id: course._id, modules: course.modules, ...versionFilter },
      {
        $set: { modules: result.modules, updatedAt: new Date() },
        $inc: { __v: 1 },
      },
    )
    if (update.modifiedCount === 1) {
      return { ...course, modules: result.modules }
    }
  }

  throw new Error('Impossible de stabiliser les identifiants des leçons après plusieurs tentatives.')
}

async function getOwnedCourse(userId, courseId) {
  if (!mongoose.isValidObjectId(courseId)) return null
  const enrollment = await Enrollment.findOne({ userId, courseId }).lean()
  if (!enrollment) return null
  const course = await findCourseWithStableSubdocumentIds(courseId)
  return course ? { enrollment, course } : null
}

export async function getLearningCourse(request, response, next) {
  try {
    const result = await getOwnedCourse(request.user._id, request.params.courseId)
    if (!result) {
      return response.status(404).json({ message: 'Cours introuvable ou accès réservé aux personnes inscrites.' })
    }
    const { enrollment, course } = result
    const progress = progressFor(course, enrollment.completedLessonIds || [])
    return response.json({
      course: {
        id: String(course._id),
        title: course.title,
        description: course.description,
        status: course.status,
        enrollmentSource: enrollment.source || 'payment',
        modules: course.modules.map((module) => ({
          id: String(module._id),
          title: module.title,
          lessons: module.lessons.map((lesson) => ({
            id: String(lesson._id),
            title: lesson.title,
            durationMinutes: lesson.durationMinutes,
            videoUrl: lesson.videoUrl,
            content: lesson.content,
            completed: progress.completedLessonIds.includes(String(lesson._id)),
          })),
        })),
      },
      progress: {
        completedCount: progress.completedCount,
        totalCount: progress.totalCount,
        percentage: progress.percentage,
      },
    })
  } catch (error) {
    return next(error)
  }
}

export async function updateLessonProgress(request, response, next) {
  try {
    const { lessonId, completed } = request.body || {}
    if (
      Object.keys(request.body || {}).some((key) => !['lessonId', 'completed'].includes(key))
      || !mongoose.isValidObjectId(request.params.courseId)
      || !mongoose.isValidObjectId(lessonId)
      || typeof completed !== 'boolean'
    ) {
      return response.status(400).json({
        message: 'La leçon ou les données de progression ne sont pas valides. Actualisez le cours et réessayez.',
      })
    }

    const result = await getOwnedCourse(request.user._id, request.params.courseId)
    if (!result) {
      return response.status(404).json({ message: 'Cours introuvable ou accès réservé aux personnes inscrites.' })
    }
    const { course } = result
    const lessonExists = course.modules.some((module) =>
      module.lessons.some((lesson) => String(lesson._id) === String(lessonId)))
    if (!lessonExists) {
      return response.status(404).json({ message: 'Cette leçon ne fait pas partie du cours.' })
    }

    const update = completed
      ? { $addToSet: { completedLessonIds: lessonId } }
      : { $pull: { completedLessonIds: lessonId } }
    const enrollment = await Enrollment.findOneAndUpdate(
      { userId: request.user._id, courseId: course._id },
      update,
      { returnDocument: 'after', runValidators: true },
    ).lean()
    if (!enrollment) {
      return response.status(404).json({ message: 'Inscription introuvable.' })
    }
    const progress = progressFor(course, enrollment.completedLessonIds || [])
    return response.json({
      progress: {
        completedLessonIds: progress.completedLessonIds,
        completedCount: progress.completedCount,
        totalCount: progress.totalCount,
        percentage: progress.percentage,
      },
    })
  } catch (error) {
    return next(error)
  }
}
