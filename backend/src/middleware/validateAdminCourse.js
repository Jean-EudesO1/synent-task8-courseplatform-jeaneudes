const levels = new Set(['Débutant', 'Intermédiaire', 'Avancé'])
const statuses = new Set(['draft', 'published'])
const courseFields = new Set([
  'title',
  'description',
  'category',
  'level',
  'image',
  'price',
  'currency',
  'status',
  'modules',
])
const fieldLabels = {
  title: 'titre',
  description: 'description',
  category: 'catégorie',
}

function fail(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function validateHttpUrl(value, label) {
  if (value === '') return
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw fail(`${label} doit être une URL HTTP ou HTTPS valide.`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw fail(`${label} doit être une URL HTTP ou HTTPS valide.`)
  }
}

function validateLesson(lesson, moduleIndex, lessonIndex, lessonIds) {
  const label = `Leçon ${lessonIndex + 1} du module ${moduleIndex + 1}`
  if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
    throw fail(`${label} est invalide.`)
  }
  if (typeof lesson.title !== 'string' || !lesson.title.trim() || lesson.title.trim().length > 160) {
    throw fail(`${label} : le titre est obligatoire (160 caractères maximum).`)
  }
  if (
    !Number.isSafeInteger(lesson.durationMinutes)
    || lesson.durationMinutes < 0
  ) {
    throw fail(`${label} : la durée doit être un entier positif ou nul en minutes.`)
  }
  if (typeof lesson.videoUrl !== 'string' || lesson.videoUrl.length > 2048) {
    throw fail(`${label} : l’URL vidéo est invalide.`)
  }
  validateHttpUrl(lesson.videoUrl, `${label} : l’URL vidéo`)
  if (lesson.content !== undefined && (
    typeof lesson.content !== 'string' || lesson.content.length > 20000
  )) {
    throw fail(`${label} : le contenu doit être du texte de 20 000 caractères maximum.`)
  }
  if (lesson._id !== undefined && !/^[a-f\d]{24}$/i.test(String(lesson._id))) {
    throw fail(`${label} : identifiant invalide.`)
  }
  if (lesson._id && lessonIds.has(String(lesson._id))) {
    throw fail(`${label} : identifiant de leçon dupliqué.`)
  }
  if (lesson._id) lessonIds.add(String(lesson._id))
}

function validateModule(module, moduleIndex, moduleIds, lessonIds) {
  const label = `Module ${moduleIndex + 1}`
  if (!module || typeof module !== 'object' || Array.isArray(module)) {
    throw fail(`${label} est invalide.`)
  }
  if (typeof module.title !== 'string' || !module.title.trim() || module.title.trim().length > 160) {
    throw fail(`${label} : le titre est obligatoire (160 caractères maximum).`)
  }
  if (!Array.isArray(module.lessons) || module.lessons.length > 200) {
    throw fail(`${label} : la liste des leçons est invalide (200 maximum).`)
  }
  if (module._id !== undefined && !/^[a-f\d]{24}$/i.test(String(module._id))) {
    throw fail(`${label} : identifiant invalide.`)
  }
  if (module._id && moduleIds.has(String(module._id))) {
    throw fail(`${label} : identifiant de module dupliqué.`)
  }
  if (module._id) moduleIds.add(String(module._id))
  module.lessons.forEach((lesson, lessonIndex) => (
    validateLesson(lesson, moduleIndex, lessonIndex, lessonIds)
  ))
}

export function validateAdminCourse(request, response, next) {
  try {
    const course = request.body
    if (!course || typeof course !== 'object' || Array.isArray(course)) {
      throw fail('Les données du cours sont invalides.')
    }
    const unknownFields = Object.keys(course).filter((field) => !courseFields.has(field))
    if (unknownFields.length) {
      throw fail(`Champ(s) non autorisé(s) : ${unknownFields.join(', ')}.`)
    }
    for (const field of ['title', 'description', 'category']) {
      const maximum = field === 'description' ? 5000 : field === 'category' ? 80 : 160
      if (
        typeof course[field] !== 'string'
        || !course[field].trim()
        || course[field].trim().length > maximum
      ) {
        throw fail(`Le champ « ${fieldLabels[field]} » est obligatoire (maximum ${maximum} caractères).`)
      }
    }
    if (!levels.has(course.level)) {
      throw fail('Le niveau doit être Débutant, Intermédiaire ou Avancé.')
    }
    if (!Number.isSafeInteger(course.price) || course.price < 0) {
      throw fail('Le prix doit être un entier non négatif en paise.')
    }
    if (course.currency !== 'INR') {
      throw fail('La devise autorisée est INR.')
    }
    if (!statuses.has(course.status)) {
      throw fail('Le statut doit être draft ou published.')
    }
    if (course.image !== undefined && (
      typeof course.image !== 'string' || course.image.length > 2048
    )) {
      throw fail('Le chemin de l’image est invalide.')
    }
    if (course.image?.startsWith('/')) {
      if (course.image.startsWith('//') || course.image.includes('..')) {
        throw fail('Le chemin de l’image est invalide.')
      }
    } else if (course.image) {
      validateHttpUrl(course.image, 'L’image')
    }
    if (!Array.isArray(course.modules) || course.modules.length > 100) {
      throw fail('La liste des modules est invalide (100 maximum).')
    }
    const moduleIds = new Set()
    const lessonIds = new Set()
    course.modules.forEach((module, index) => (
      validateModule(module, index, moduleIds, lessonIds)
    ))
    request.validatedCourse = {
      title: course.title.trim(),
      description: course.description.trim(),
      category: course.category.trim(),
      level: course.level,
      image: course.image?.trim() || '/courses/course-placeholder.svg',
      price: course.price,
      currency: 'INR',
      status: course.status,
      modules: course.modules.map((module) => ({
        ...(module._id ? { _id: module._id } : {}),
        title: module.title.trim(),
        lessons: module.lessons.map((lesson) => ({
          ...(lesson._id ? { _id: lesson._id } : {}),
          title: lesson.title.trim(),
          durationMinutes: lesson.durationMinutes,
          videoUrl: lesson.videoUrl.trim(),
          content: lesson.content || '',
        })),
      })),
    }
    return next()
  } catch (error) {
    if (error.status === 400) {
      return response.status(400).json({ message: error.message })
    }
    return next(error)
  }
}
