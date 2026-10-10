import mongoose from 'mongoose'
import Course from '../models/Course.js'

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
    return response.json({ courses })
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
  try {
    const course = await Course.findByIdAndDelete(request.params.id)
    if (!course) return response.status(404).json({ message: 'Cours introuvable.' })
    return response.status(204).end()
  } catch (error) {
    return next(error)
  }
}
