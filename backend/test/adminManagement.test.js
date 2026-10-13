import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import mongoose from 'mongoose'
import { configureDnsServers } from '../src/utils/dnsConfig.js'
import { isAdminDirectoryResponse } from '../../frontend/src/adminDirectory.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET ||= randomUUID() + randomUUID()

const [
  { default: app },
  { frontendUrl },
  { default: Course },
  { default: EmailNotification },
  { default: Enrollment },
  { default: Payment },
  { default: User },
  { createAuthToken },
  emailService,
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config.js'),
  import('../src/models/Course.js'),
  import('../src/models/EmailNotification.js'),
  import('../src/models/Enrollment.js'),
  import('../src/models/Payment.js'),
  import('../src/models/User.js'),
  import('../src/utils/auth.js'),
  import('../src/services/emailService.js'),
])

const suffix = randomUUID()
const users = []
const server = app.listen(0)
const baseUrl = await new Promise((resolve) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
let csrfToken = ''
let course
let capturedPayment
let legacyUserId

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
  return { response, data: text ? JSON.parse(text) : null }
}

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  configureDnsServers()
  await mongoose.connect(process.env.MONGODB_URI)
  users.push(
    await User.create({
      name: 'Management Admin',
      email: `management-admin-${suffix}@example.invalid`,
      passwordHash: 'sensitive-password-hash-test',
      role: 'admin',
      emailVerified: true,
    }),
    await User.create({
      name: 'Management Student',
      email: `management-student-${suffix}@example.invalid`,
      passwordHash: 'student-password-hash-test',
      role: 'student',
      emailVerified: false,
    }),
    await User.create({
      name: 'Second Management Student',
      email: `management-second-${suffix}@example.invalid`,
      passwordHash: 'second-password-hash-test',
      role: 'student',
      emailVerified: true,
    }),
  )
  legacyUserId = new mongoose.Types.ObjectId()
  await User.collection.insertOne({
    _id: legacyUserId,
    name: 'Legacy Contract Student',
    email: `legacy-contract-${suffix}@example.invalid`,
    passwordHash: 'legacy-password-hash-test',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  course = await Course.create({
    slug: `management-course-${suffix}`,
    title: `Management Course ${suffix}`,
    description: 'Cours de consultation administrative.',
    category: 'Tests',
    level: 'Débutant',
    price: 4200,
    currency: 'INR',
    status: 'published',
    modules: [{
      title: 'Module',
      lessons: [{ title: 'Leçon 1' }, { title: 'Leçon 2' }],
    }],
  })
  capturedPayment = await Payment.create({
    userId: users[1]._id,
    courseId: course._id,
    razorpayOrderId: `order_admin_${suffix}`,
    razorpayPaymentId: `pay_admin_${suffix}`,
    amount: 4200,
    currency: 'INR',
    status: 'captured',
    capturedAt: new Date(),
  })
  await Enrollment.create([
    {
      userId: users[1]._id,
      courseId: course._id,
      paymentId: capturedPayment._id,
      source: 'payment',
      completedLessonIds: [course.modules[0].lessons[0]._id],
    },
    {
      userId: users[2]._id,
      courseId: course._id,
      source: 'development-test',
    },
  ])
  const csrf = await request('/api/auth/csrf', { anonymous: true })
  csrfToken = csrf.data.csrfToken
})

after(async () => {
  await EmailNotification.deleteMany({ recipient: { $regex: `^admin-email-test-${suffix}@` } })
  await Enrollment.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  await Payment.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  if (course) await Course.deleteOne({ _id: course._id })
  if (legacyUserId) await User.collection.deleteOne({ _id: legacyUserId })
  await User.deleteMany({ _id: { $in: users.map((user) => user._id) } })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('listes administratives exigent une session et le rôle admin', async () => {
  for (const path of ['/api/admin/users', '/api/admin/enrollments']) {
    const visitor = await request(path, { anonymous: true })
    assert.equal(visitor.response.status, 401)
    const student = await request(path, { userIndex: 1 })
    assert.equal(student.response.status, 403)
  }
})

test('liste paginée des utilisateurs recherche et filtre sans exposer les secrets', async () => {
  const filtered = await request('/api/admin/users?q=management&role=student&emailVerified=false&limit=1')
  assert.equal(filtered.response.status, 200)
  assert.equal(filtered.data.users.length, 1)
  assert.equal(filtered.data.users[0].name, 'Management Student')
  assert.equal(filtered.data.users[0].emailVerified, false)
  assert.equal(filtered.data.pagination.total, 1)
  assert.equal(filtered.data.pagination.page, 1)
  assert.equal(JSON.stringify(filtered.data).includes('passwordHash'), false)
  assert.equal(JSON.stringify(filtered.data).includes('sensitive-password-hash-test'), false)
  assert.equal(JSON.stringify(filtered.data).includes('tokenVersion'), false)

  const invalidRole = await request('/api/admin/users?role=superadmin')
  assert.equal(invalidRole.response.status, 400)
  const invalidPage = await request('/api/admin/users?page=0')
  assert.equal(invalidPage.response.status, 400)

  const secondPage = await request('/api/admin/users?q=management&role=student&limit=1&page=2')
  assert.equal(secondPage.data.users.length, 1)
  assert.equal(secondPage.data.pagination.totalPages, 2)
})

test('le contrat API utilisateurs inclut le statut booléen pour les comptes historiques', async () => {
  const result = await request('/api/admin/users?q=legacy-contract')
  assert.equal(result.response.status, 200)
  assert.deepEqual(Object.keys(result.data).sort(), ['pagination', 'users'])
  assert.deepEqual(Object.keys(result.data.pagination).sort(), ['limit', 'page', 'total', 'totalPages'])
  assert.equal(result.data.users.length, 1)
  assert.deepEqual(Object.keys(result.data.users[0]).sort(), [
    'createdAt',
    'email',
    'emailVerified',
    'id',
    'name',
    'role',
  ])
  assert.equal(result.data.users[0].emailVerified, false)
  assert.equal(isAdminDirectoryResponse(result.data, 'users'), true)
})

test('liste paginée des inscriptions différencie Razorpay et test local, sans fuite de paiement', async () => {
  const paid = await request('/api/admin/enrollments?q=management&source=payment&paymentStatus=captured')
  assert.equal(paid.response.status, 200)
  assert.deepEqual(Object.keys(paid.data).sort(), ['enrollments', 'pagination'])
  assert.deepEqual(Object.keys(paid.data.pagination).sort(), ['limit', 'page', 'total', 'totalPages'])
  assert.equal(isAdminDirectoryResponse(paid.data, 'enrollments'), true)
  assert.equal(paid.data.enrollments.length, 1)
  assert.equal(paid.data.enrollments[0].source, 'payment')
  assert.equal(paid.data.enrollments[0].payment.amount, 4200)
  assert.equal(paid.data.enrollments[0].payment.currency, 'INR')
  assert.equal(paid.data.enrollments[0].payment.status, 'captured')
  assert.equal(paid.data.enrollments[0].progress.percentage, 50)
  assert.equal(JSON.stringify(paid.data).includes(`order_admin_${suffix}`), false)
  assert.equal(JSON.stringify(paid.data).includes(`pay_admin_${suffix}`), false)
  assert.equal(JSON.stringify(paid.data).includes('sensitive-password-hash-test'), false)

  const development = await request('/api/admin/enrollments?source=development-test&q=management')
  assert.equal(development.response.status, 200)
  assert.equal(development.data.enrollments.length, 1)
  assert.equal(development.data.enrollments[0].source, 'development-test')
  assert.equal(development.data.enrollments[0].payment, null)
  assert.equal(development.data.enrollments[0].progress.percentage, 0)

  const paginated = await request('/api/admin/enrollments?q=management&limit=1&page=1')
  assert.equal(paginated.data.enrollments.length, 1)
  assert.equal(paginated.data.pagination.total, 2)
  assert.equal(paginated.data.pagination.totalPages, 2)
  const invalidSource = await request('/api/admin/enrollments?source=free')
  assert.equal(invalidSource.response.status, 400)
})

test('notification de test exige CSRF, un administrateur et NODE_ENV=development', async () => {
  const visitor = await request('/api/admin/notifications/test-email', {
    method: 'POST',
    anonymous: true,
    csrf: true,
    body: { email: 'test@example.invalid' },
  })
  assert.equal(visitor.response.status, 401)
  const student = await request('/api/admin/notifications/test-email', {
    method: 'POST',
    userIndex: 1,
    csrf: true,
    body: { email: 'test@example.invalid' },
  })
  assert.equal(student.response.status, 403)
  const missingCsrf = await request('/api/admin/notifications/test-email', {
    method: 'POST',
    body: { email: 'test@example.invalid' },
  })
  assert.equal(missingCsrf.response.status, 403)
  const productionDenied = await request('/api/admin/notifications/test-email', {
    method: 'POST',
    userIndex: 0,
    csrf: true,
    body: { email: 'test@example.invalid' },
  })
  assert.equal(productionDenied.response.status, 403)

  const testMessages = []
  emailService.setTestEmailSender(async (message) => {
    testMessages.push(message)
    return { messageId: 'admin-notification-test' }
  })
  process.env.NODE_ENV = 'development'
  const delivered = await request('/api/admin/notifications/test-email', {
    method: 'POST',
    userIndex: 0,
    csrf: true,
    body: { email: `admin-email-test-${suffix}@example.invalid` },
  })
  process.env.NODE_ENV = 'test'
  emailService.setTestEmailSender(null)
  assert.equal(delivered.response.status, 202)
  assert.match(delivered.data.message, /e-mail de test envoyé/i)
  assert.equal(testMessages.length, 1)
  assert.match(testMessages[0].subject, /^\[TEST\]/)
  assert.match(testMessages[0].text, /Aucune inscription ni aucun paiement/)
  const notification = await EmailNotification.findOne({
    recipient: `admin-email-test-${suffix}@example.invalid`,
  }).lean()
  assert.equal(notification.kind, 'test')
  assert.equal(notification.status, 'sent')
  assert.equal(notification.paymentId, undefined)
})
