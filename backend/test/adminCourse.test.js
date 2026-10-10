import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import mongoose from 'mongoose'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET ||= randomUUID() + randomUUID()

const [
  { default: app },
  { frontendUrl },
  { default: Course },
  { default: User },
  { createAuthToken },
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config.js'),
  import('../src/models/Course.js'),
  import('../src/models/User.js'),
  import('../src/utils/auth.js'),
])

const suffix = randomUUID()
const adminEmail = `admin-courses-${suffix}@example.invalid`
const studentEmail = `student-courses-${suffix}@example.invalid`
const users = []
const server = app.listen(0)
const baseUrl = await new Promise((resolve) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
let csrfToken = ''
let courseId = ''

async function request(path, {
  method = 'GET',
  body,
  role,
  csrf = false,
} = {}) {
  const user = role === 'admin' ? users[1] : role === 'student' ? users[0] : null
  const headers = {
    Origin: frontendUrl,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrfToken } : {}),
  }
  const cookies = [
    csrfToken && `csrf_token=${csrfToken}`,
    user && `course_session=${createAuthToken(user)}`,
  ].filter(Boolean)
  if (cookies.length) headers.Cookie = cookies.join('; ')

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const responseBody = await response.text()
  let data = null
  if (responseBody) {
    try {
      data = JSON.parse(responseBody)
    } catch {
      throw new Error(`Réponse non JSON HTTP ${response.status} pour ${path}: ${responseBody.slice(0, 160)}`)
    }
  }
  return {
    response,
    data,
  }
}

function coursePayload(overrides = {}) {
  return {
    title: `Admin test ${suffix}`,
    description: 'Cours créé pour tester les opérations administrateur.',
    category: `Admin test ${suffix}`,
    level: 'Débutant',
    image: '/courses/course-placeholder.svg',
    price: 25900,
    currency: 'INR',
    status: 'draft',
    modules: [{
      title: 'Module original',
      lessons: [{
        title: 'Leçon originale',
        durationMinutes: 10,
        videoUrl: 'https://videos.example.invalid/lesson',
        content: 'Contenu réservé',
      }],
    }],
    ...overrides,
  }
}

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  await mongoose.connect(process.env.MONGODB_URI)
  users.push(
    await User.create({
      name: 'Course Admin Student',
      email: studentEmail,
      passwordHash: 'not-used-in-this-test',
      role: 'student',
    }),
    await User.create({
      name: 'Course Admin',
      email: adminEmail,
      passwordHash: 'not-used-in-this-test',
      role: 'admin',
    }),
  )
  const csrfResponse = await request('/api/auth/csrf')
  assert.equal(csrfResponse.response.status, 200)
  csrfToken = csrfResponse.data.csrfToken
})

after(async () => {
  if (courseId) await Course.deleteOne({ _id: courseId })
  await User.deleteMany({ _id: { $in: users.map((user) => user._id) } })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('refuse les accès visiteurs et étudiants, exige CSRF pour les mutations admin', async () => {
  const visitor = await request('/api/admin/courses')
  assert.equal(visitor.response.status, 401)

  const student = await request('/api/admin/courses', { role: 'student' })
  assert.equal(student.response.status, 403)

  const missingCsrf = await request('/api/admin/courses', {
    method: 'POST',
    role: 'admin',
    body: coursePayload(),
  })
  assert.equal(missingCsrf.response.status, 403)

  const publicAdminRoute = await request('/api/admin/courses', { role: 'admin' })
  assert.equal(publicAdminRoute.response.status, 200)
})

test('valide les champs du cours, le prix INR et les URL vidéo HTTP/HTTPS', async () => {
  const invalidCases = [
    [{ ...coursePayload(), title: ' ' }, /titre.*obligatoire/],
    [{ ...coursePayload(), price: 1.5 }, /entier non négatif en paise/],
    [{ ...coursePayload(), price: -1 }, /entier non négatif en paise/],
    [{ ...coursePayload(), currency: 'USD' }, /devise autorisée est INR/],
    [coursePayload({ modules: [{ title: 'M', lessons: [{
      title: 'L', durationMinutes: 1, videoUrl: 'javascript:alert(1)',
    }] }] }), /URL HTTP ou HTTPS valide/],
  ]
  for (const [body, message] of invalidCases) {
    const result = await request('/api/admin/courses', {
      method: 'POST',
      role: 'admin',
      csrf: true,
      body,
    })
    assert.equal(result.response.status, 400)
    assert.match(result.data.message, message)
  }
})

test('crée, modifie, réordonne, publie et supprime cours, modules et leçons', async () => {
  const created = await request('/api/admin/courses', {
    method: 'POST',
    role: 'admin',
    csrf: true,
    body: coursePayload(),
  })
  assert.equal(created.response.status, 201)
  courseId = created.data.course._id
  const originalModuleId = created.data.course.modules[0]._id
  const originalLessonId = created.data.course.modules[0].lessons[0]._id
  assert.ok(originalModuleId)
  assert.ok(originalLessonId)

  const list = await request('/api/admin/courses', { role: 'admin' })
  assert.ok(list.data.courses.some((course) => course._id === courseId))
  const initialPublic = await request(`/api/courses/${courseId}`)
  assert.equal(initialPublic.response.status, 404)

  const updatePayload = coursePayload({
    status: 'published',
    modules: [
      {
        title: 'Module ajouté',
        lessons: [{
          title: 'Nouvelle leçon',
          durationMinutes: 4,
          videoUrl: '',
          content: '',
        }],
      },
      {
        _id: originalModuleId,
        title: 'Module renommé',
        lessons: [{
          _id: originalLessonId,
          title: 'Leçon renommée',
          durationMinutes: 15,
          videoUrl: 'https://videos.example.invalid/updated',
          content: 'Contenu mis à jour',
        }],
      },
    ],
  })
  const updated = await request(`/api/admin/courses/${courseId}`, {
    method: 'PUT',
    role: 'admin',
    csrf: true,
    body: updatePayload,
  })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.data.course.status, 'published')
  assert.equal(updated.data.course.modules[1]._id, originalModuleId)
  assert.equal(updated.data.course.modules[1].lessons[0]._id, originalLessonId)
  assert.equal(updated.data.course.modules[0].title, 'Module ajouté')

  const publicCourse = await request(`/api/courses/${courseId}`)
  assert.equal(publicCourse.response.status, 200)
  assert.equal(JSON.stringify(publicCourse.data).includes('videos.example.invalid'), false)
  assert.equal(JSON.stringify(publicCourse.data).includes('Contenu mis à jour'), false)

  const deleted = await request(`/api/admin/courses/${courseId}`, {
    method: 'DELETE',
    role: 'admin',
    csrf: true,
  })
  assert.equal(deleted.response.status, 204)
  const deletedId = courseId
  courseId = ''
  const missingFromList = await request('/api/admin/courses', { role: 'admin' })
  assert.ok(!missingFromList.data.courses.some((course) => course._id === deletedId))
  const missingPublic = await request(`/api/courses/${deletedId}`)
  assert.equal(missingPublic.response.status, 404)
})
