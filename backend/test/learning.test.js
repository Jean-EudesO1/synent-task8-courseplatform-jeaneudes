import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import mongoose from 'mongoose'
import { configureDnsServers } from '../src/utils/dnsConfig.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET ||= randomUUID() + randomUUID()

const [
  { default: app },
  { frontendUrl },
  { default: Course },
  { default: Enrollment },
  { default: Payment },
  { default: User },
  { createAuthToken },
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config.js'),
  import('../src/models/Course.js'),
  import('../src/models/Enrollment.js'),
  import('../src/models/Payment.js'),
  import('../src/models/User.js'),
  import('../src/utils/auth.js'),
])

const suffix = randomUUID()
const users = []
const server = app.listen(0)
const baseUrl = await new Promise((resolve) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
let csrfToken = ''
let course
let emptyCourse
let legacyCourseId

async function request(path, {
  method = 'GET',
  body,
  userIndex = 0,
  anonymous = false,
  csrf = false,
} = {}) {
  const headers = {
    Origin: frontendUrl,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrfToken } : {}),
  }
  const cookies = [
    csrfToken && `csrf_token=${csrfToken}`,
    !anonymous && users[userIndex] && `course_session=${createAuthToken(users[userIndex])}`,
  ].filter(Boolean)
  if (cookies.length) headers.Cookie = cookies.join('; ')
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`Réponse non JSON HTTP ${response.status} pour ${path}.`)
    }
  }
  return { response, data }
}

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  configureDnsServers()
  await mongoose.connect(process.env.MONGODB_URI)
  users.push(
    await User.create({
      name: 'Learning User',
      email: `learning-${suffix}@example.invalid`,
      passwordHash: 'not-used-in-this-test',
      role: 'student',
      emailVerified: true,
    }),
    await User.create({
      name: 'Other Learning User',
      email: `learning-other-${suffix}@example.invalid`,
      passwordHash: 'not-used-in-this-test',
      role: 'student',
      emailVerified: true,
    }),
  )
  course = await Course.create({
    slug: `learning-test-${suffix}`,
    title: 'Test apprentissage',
    description: 'Cours de test avec leçons privées.',
    category: 'Tests',
    level: 'Débutant',
    price: 0,
    currency: 'INR',
    status: 'published',
    modules: [
      {
        title: 'Module un',
        lessons: [
          {
            title: 'Leçon A',
            durationMinutes: 5,
            videoUrl: 'https://video.example.invalid/a.mp4',
            content: 'Contenu privé A',
          },
          {
            title: 'Leçon B',
            durationMinutes: 8,
            videoUrl: 'https://video.example.invalid/b.mp4',
            content: 'Contenu privé B',
          },
        ],
      },
      {
        title: 'Module deux',
        lessons: [{
          title: 'Leçon C',
          durationMinutes: 10,
          videoUrl: '',
          content: 'Contenu privé C',
        }],
      },
    ],
  })
  emptyCourse = await Course.create({
    slug: `learning-empty-${suffix}`,
    title: 'Cours sans leçon',
    description: 'Pas encore de leçons.',
    category: 'Tests',
    level: 'Débutant',
    price: 0,
    currency: 'INR',
    status: 'published',
    modules: [{ title: 'Module vide', lessons: [] }],
  })
  await Enrollment.create({
    userId: users[0]._id,
    courseId: course._id,
    source: 'development-test',
  })
  await Enrollment.create({
    userId: users[0]._id,
    courseId: emptyCourse._id,
    source: 'development-test',
  })
  assert.equal(await Payment.countDocuments({
    userId: users[0]._id,
    courseId: { $in: [course._id, emptyCourse._id] },
  }), 0)
  const csrf = await request('/api/auth/csrf', { anonymous: true })
  csrfToken = csrf.data.csrfToken
})

after(async () => {
  await Enrollment.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  await Payment.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  if (course) await Course.deleteOne({ _id: course._id })
  if (emptyCourse) await Course.deleteOne({ _id: emptyCourse._id })
  if (legacyCourseId) await Course.collection.deleteOne({ _id: legacyCourseId })
  await User.deleteMany({ _id: { $in: users.map((user) => user._id) } })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('le cours et ses contenus privés exigent une session et une inscription propriétaire', async () => {
  const visitor = await request(`/api/learning/courses/${course.id}`, { anonymous: true })
  assert.equal(visitor.response.status, 401)

  const otherUser = await request(`/api/learning/courses/${course.id}`, { userIndex: 1 })
  assert.equal(otherUser.response.status, 404)

  const unauthorizedProgress = await request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    userIndex: 1,
    csrf: true,
    body: { lessonId: String(course.modules[0].lessons[0]._id), completed: true },
  })
  assert.equal(unauthorizedProgress.response.status, 404)

  const missingCsrf = await request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    body: { lessonId: String(course.modules[0].lessons[0]._id), completed: true },
  })
  assert.equal(missingCsrf.response.status, 403)

  const learning = await request(`/api/learning/courses/${course.id}`)
  assert.equal(learning.response.status, 200)
  assert.equal(learning.data.course.enrollmentSource, 'development-test')
  assert.deepEqual(learning.data.course.modules.map((module) => module.title), ['Module un', 'Module deux'])
  assert.equal(learning.data.course.modules[0].lessons[0].videoUrl, 'https://video.example.invalid/a.mp4')
  assert.equal(learning.data.course.modules[0].lessons[0].content, 'Contenu privé A')

  const publicDetails = await request(`/api/courses/${course.id}`)
  assert.equal(JSON.stringify(publicDetails.data).includes('video.example.invalid'), false)
  assert.equal(JSON.stringify(publicDetails.data).includes('Contenu privé A'), false)

  const myEnrollments = await request('/api/enrollments/me')
  assert.equal(myEnrollments.data.enrollments.length, 2)
  assert.equal(myEnrollments.data.enrollments[0].source, 'development-test')
  assert.equal(myEnrollments.data.enrollments[0].progress.percentage, 0)
  const anotherUserEnrollments = await request('/api/enrollments/me', { userIndex: 1 })
  assert.equal(anotherUserEnrollments.data.enrollments.length, 0)
})

test('la progression est privée, persistante, idempotente et conservée après réordonnancement', async () => {
  const lessons = course.modules.flatMap((module) => module.lessons)
  const lessonA = lessons[0]
  const lessonB = lessons[1]
  const lessonC = lessons[2]
  const mark = () => request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    csrf: true,
    body: { lessonId: String(lessonB._id), completed: true },
  })

  const updated = await mark()
  assert.equal(updated.response.status, 200)
  assert.equal(updated.data.progress.completedCount, 1)
  assert.equal(updated.data.progress.totalCount, 3)
  assert.equal(updated.data.progress.percentage, 33)
  await Promise.all([mark(), mark(), mark()])
  assert.equal(await Enrollment.findOne({ userId: users[0]._id, courseId: course._id })
    .then((enrollment) => enrollment.completedLessonIds.length), 1)

  const afterReload = await request(`/api/learning/courses/${course.id}`)
  assert.equal(afterReload.data.course.modules[0].lessons[1].completed, true)

  const courseToReorder = await Course.findById(course._id)
    .select('+modules.lessons.videoUrl +modules.lessons.content')
  courseToReorder.modules.reverse()
  await courseToReorder.save()
  const afterReorder = await request(`/api/learning/courses/${course.id}`)
  assert.equal(afterReorder.data.course.modules[1].lessons[1].completed, true)

  const invalidLesson = await request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    csrf: true,
    body: { lessonId: new mongoose.Types.ObjectId().toString(), completed: true },
  })
  assert.equal(invalidLesson.response.status, 404)

  const unmark = await request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    csrf: true,
    body: { lessonId: String(lessonB._id), completed: false },
  })
  assert.equal(unmark.response.status, 200)
  assert.equal(unmark.data.progress.completedCount, 0)
  assert.equal(unmark.data.progress.percentage, 0)

  await request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    csrf: true,
    body: { lessonId: String(lessonA._id), completed: true },
  })
  const beforeDeleteLesson = await Enrollment.findOne({ userId: users[0]._id, courseId: course._id })
  const completedB = String(lessonA._id)
  await Course.updateOne(
    { _id: course._id },
    { $pull: { 'modules.$[].lessons': { _id: lessonA._id } } },
  )
  const afterDeletingLesson = await request(`/api/learning/courses/${course.id}`)
  assert.equal(afterDeletingLesson.data.progress.totalCount, 2)
  assert.equal(afterDeletingLesson.data.progress.completedCount, 0)
  assert.equal(afterDeletingLesson.data.progress.percentage, 0)
  assert.ok(beforeDeleteLesson.completedLessonIds.map(String).includes(completedB))

  const otherUserProgress = await request(`/api/learning/courses/${course.id}/progress`, {
    method: 'PATCH',
    userIndex: 1,
    csrf: true,
    body: { lessonId: String(lessonC._id), completed: true },
  })
  assert.equal(otherUserProgress.response.status, 404)
})

test('les cours archivés restent accessibles aux inscrits et les cours sans leçons valent zéro', async () => {
  await Course.updateOne({ _id: course._id }, { $set: { status: 'archived' } })
  const archived = await request(`/api/learning/courses/${course.id}`)
  assert.equal(archived.response.status, 200)
  assert.equal(archived.data.course.status, 'archived')

  const empty = await request(`/api/learning/courses/${emptyCourse.id}`)
  assert.equal(empty.response.status, 200)
  assert.equal(empty.data.progress.totalCount, 0)
  assert.equal(empty.data.progress.completedCount, 0)
  assert.equal(empty.data.progress.percentage, 0)
})

test('les cours historiques sans identifiants imbriqués sont migrés avant la progression', async () => {
  legacyCourseId = new mongoose.Types.ObjectId()
  await Course.collection.insertOne({
    _id: legacyCourseId,
    slug: `learning-legacy-${suffix}`,
    title: 'Cours historique',
    description: 'Cours créé avant les identifiants imbriqués.',
    category: 'Tests',
    level: 'Débutant',
    image: '/courses/course-placeholder.svg',
    price: 0,
    currency: 'INR',
    status: 'published',
    modules: [{
      title: 'Module historique',
      lessons: [{
        title: 'Leçon historique',
        durationMinutes: 4,
        videoUrl: 'https://video.example.invalid/legacy.mp4',
        content: 'Contenu historique privé',
      }],
    }],
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await Enrollment.create({
    userId: users[0]._id,
    courseId: legacyCourseId,
    source: 'development-test',
  })
  const learningUrl = `/api/learning/courses/${legacyCourseId}`
  const progressUrl = `${learningUrl}/progress`
  const storedBefore = await Course.collection.findOne({ _id: legacyCourseId })
  assert.equal(storedBefore.modules[0]._id, undefined)
  assert.equal(storedBefore.modules[0].lessons[0]._id, undefined)

  const learning = await request(learningUrl)
  assert.equal(learning.response.status, 200)
  const module = learning.data.course.modules[0]
  const lesson = module.lessons[0]
  assert.equal(mongoose.isValidObjectId(module.id), true)
  assert.equal(mongoose.isValidObjectId(lesson.id), true)

  const body = { lessonId: lesson.id, completed: true }
  const progress = await request(progressUrl, {
    method: 'PATCH',
    csrf: true,
    body,
  })
  console.log(JSON.stringify({
    diagnostic: 'legacy-learning-progress',
    requests: [
      {
        method: 'GET',
        url: learningUrl,
        params: { courseId: String(legacyCourseId) },
        body: null,
        status: learning.response.status,
        response: {
          courseId: learning.data.course.id,
          moduleId: module.id,
          lessonId: lesson.id,
          progress: learning.data.progress,
        },
      },
      {
        method: 'PATCH',
        url: progressUrl,
        params: { courseId: String(legacyCourseId) },
        body,
        status: progress.response.status,
        response: progress.data,
      },
      {
        action: 'sélectionner une autre leçon',
        httpRequest: false,
        detail: 'La navigation entre les leçons est gérée côté React.',
      },
    ],
  }))
  assert.equal(progress.response.status, 200)
  assert.equal(progress.data.progress.completedCount, 1)
  assert.equal(progress.data.progress.totalCount, 1)
  assert.equal(progress.data.progress.percentage, 100)

  const storedAfter = await Course.collection.findOne({ _id: legacyCourseId })
  assert.equal(String(storedAfter.modules[0]._id), module.id)
  assert.equal(String(storedAfter.modules[0].lessons[0]._id), lesson.id)
  const afterReload = await request(learningUrl)
  assert.equal(afterReload.data.course.modules[0].lessons[0].completed, true)

  const denied = await request(progressUrl, {
    method: 'PATCH',
    userIndex: 1,
    csrf: true,
    body,
  })
  assert.equal(denied.response.status, 404)
})

test('le script d’inscription de développement refuse la production avant toute connexion', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/manage-development-enrollment.js', 'add', 'student@example.invalid', String(course._id)],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /réservée à NODE_ENV=development/)
})
