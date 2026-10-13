import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import mongoose from 'mongoose'
import { configureDnsServers } from '../src/utils/dnsConfig.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET ||= randomUUID() + randomUUID()
process.env.RAZORPAY_KEY_ID = 'rzp_test_fakeKeyId123'
process.env.RAZORPAY_KEY_SECRET = 'fake-test-secret-never-used-with-a-real-gateway'

const [
  { default: app },
  { frontendUrl },
  { default: Course },
  { default: EmailNotification },
  { default: Enrollment },
  { default: Payment },
  { default: User },
  { createAuthToken },
  razorpayService,
  emailService,
  emailNotificationService,
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config.js'),
  import('../src/models/Course.js'),
  import('../src/models/EmailNotification.js'),
  import('../src/models/Enrollment.js'),
  import('../src/models/Payment.js'),
  import('../src/models/User.js'),
  import('../src/utils/auth.js'),
  import('../src/services/razorpayService.js'),
  import('../src/services/emailService.js'),
  import('../src/services/emailNotificationService.js'),
])

const suffix = randomUUID()
const users = []
const courseData = {
  slug: `payment-test-${suffix}`,
  title: `Payment course ${suffix}`,
  description: 'Cours pour tests du paiement.',
  category: `Payment ${suffix}`,
  level: 'Débutant',
  image: '/courses/course-placeholder.svg',
  price: 55900,
  currency: 'INR',
  status: 'published',
  modules: [],
}
const server = app.listen(0)
const baseUrl = await new Promise((resolve) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
const gatewayState = { payment: null, createCount: 0 }
let csrfToken = ''
let course
let draftCourse
let currentOrderId = ''
let currentPaymentId = ''

function sign(orderId, paymentId) {
  return createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
}

async function request(path, {
  method = 'GET',
  body,
  userIndex = 0,
  csrf = false,
  anonymous = false,
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
  const responseBody = await response.text()
  let data = null
  if (responseBody) {
    try {
      data = JSON.parse(responseBody)
    } catch {
      throw new Error(`Réponse non JSON HTTP ${response.status} pour ${path}: ${responseBody.slice(0, 160)}`)
    }
  }
  return { response, data }
}

async function createOrder(userIndex = 0, extras = {}) {
  const result = await request('/api/orders', {
    method: 'POST',
    userIndex,
    csrf: true,
    body: { courseId: String(course._id), ...extras },
  })
  if (result.response.ok) currentOrderId = result.data.order.id
  return result
}

async function confirmPayment(userIndex = 0, overrides = {}) {
  const paymentId = overrides.razorpay_payment_id || currentPaymentId
  return request('/api/confirm', {
    method: 'POST',
    userIndex,
    csrf: true,
    body: {
      razorpay_order_id: currentOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(currentOrderId, paymentId),
      ...overrides,
    },
  })
}

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  configureDnsServers()
  await mongoose.connect(process.env.MONGODB_URI)
  users.push(
    await User.create({
      name: 'Verified Payment User',
      email: `payment-${suffix}@example.invalid`,
      passwordHash: 'not-used-in-this-test',
      role: 'student',
      emailVerified: true,
    }),
    await User.create({
      name: 'Other Verified User',
      email: `payment-other-${suffix}@example.invalid`,
      passwordHash: 'not-used-in-this-test',
      role: 'student',
      emailVerified: true,
    }),
    await User.create({
      name: 'Unverified Payment User',
      email: `payment-unverified-${suffix}@example.invalid`,
      passwordHash: 'not-used-in-this-test',
      role: 'student',
      emailVerified: false,
    }),
    await User.create({
      name: 'Payment Admin',
      email: `payment-admin-${suffix}@example.invalid`,
      passwordHash: 'not-used-in-this-test',
      role: 'admin',
      emailVerified: true,
    }),
  )
  course = await Course.create(courseData)
  draftCourse = await Course.create({
    ...courseData,
    slug: `payment-draft-${suffix}`,
    title: `Draft payment course ${suffix}`,
    status: 'draft',
  })
  razorpayService.setRazorpayTestClient({
    async createOrder({ amount, currency }) {
      gatewayState.createCount += 1
      return {
        id: `order_test_${suffix.slice(0, 16)}`,
        amount,
        currency,
        status: 'created',
      }
    },
    async fetchPayment(paymentId) {
      return { ...gatewayState.payment, id: paymentId }
    },
  })
  const csrf = await request('/api/auth/csrf', { anonymous: true })
  csrfToken = csrf.data.csrfToken
})

after(async () => {
  razorpayService.setRazorpayTestClient(undefined)
  await Enrollment.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  await EmailNotification.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  await Payment.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  if (course) await Course.deleteOne({ _id: course._id })
  if (draftCourse) await Course.deleteOne({ _id: draftCourse._id })
  await User.deleteMany({ _id: { $in: users.map((user) => user._id) } })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('commande serveur exige une session vérifiée et ignore/refuse tout montant client', async () => {
  const missingCsrf = await request('/api/orders', {
    method: 'POST',
    body: { courseId: String(course._id) },
  })
  assert.equal(missingCsrf.response.status, 403)

  const visitor = await request('/api/orders', {
    method: 'POST',
    anonymous: true,
    csrf: true,
    body: { courseId: String(course._id) },
  })
  assert.equal(visitor.response.status, 401)

  const unverified = await request('/api/orders', {
    method: 'POST',
    userIndex: 2,
    csrf: true,
    body: { courseId: String(course._id) },
  })
  assert.equal(unverified.response.status, 403)

  const attackerAmount = await createOrder(0, { amount: 1, currency: 'USD' })
  assert.equal(attackerAmount.response.status, 400)
  assert.equal(gatewayState.createCount, 0)
  const draftOrder = await request('/api/orders', {
    method: 'POST',
    csrf: true,
    body: { courseId: String(draftCourse._id) },
  })
  assert.equal(draftOrder.response.status, 404)

  const created = await createOrder()
  assert.equal(created.response.status, 201)
  assert.equal(created.data.order.amount, courseData.price)
  assert.equal(created.data.order.currency, 'INR')
  assert.match(created.data.keyId, /^rzp_test_/)
  assert.equal(JSON.stringify(created.data).includes(process.env.RAZORPAY_KEY_SECRET), false)

  const reused = await createOrder()
  assert.equal(reused.response.status, 200)
  assert.equal(reused.data.order.id, created.data.order.id)
  assert.equal(gatewayState.createCount, 1)
})

test('signature, utilisateur, montant, devise, commande et capture sont vérifiés par le serveur', async () => {
  currentPaymentId = `pay_test_${suffix.slice(0, 16)}`
  gatewayState.payment = {
    order_id: currentOrderId,
    amount: courseData.price,
    currency: 'INR',
    status: 'captured',
    captured: true,
  }

  const missingCsrf = await request('/api/confirm', {
    method: 'POST',
    body: {
      razorpay_order_id: currentOrderId,
      razorpay_payment_id: currentPaymentId,
      razorpay_signature: sign(currentOrderId, currentPaymentId),
    },
  })
  assert.equal(missingCsrf.response.status, 403)

  const badSignature = await request('/api/confirm', {
    method: 'POST',
    csrf: true,
    body: {
      razorpay_order_id: currentOrderId,
      razorpay_payment_id: currentPaymentId,
      razorpay_signature: '0'.repeat(64),
    },
  })
  assert.equal(badSignature.response.status, 400)
  assert.match(badSignature.data.message, /signature.*invalide/i)

  const otherUser = await confirmPayment(1)
  assert.equal(otherUser.response.status, 404)

  gatewayState.payment.amount += 100
  const wrongAmount = await confirmPayment()
  assert.equal(wrongAmount.response.status, 400)
  gatewayState.payment.amount = courseData.price

  gatewayState.payment.currency = 'USD'
  const wrongCurrency = await confirmPayment()
  assert.equal(wrongCurrency.response.status, 400)
  gatewayState.payment.currency = 'INR'

  gatewayState.payment.order_id = `order_other_${suffix.slice(0, 10)}`
  const wrongOrder = await confirmPayment()
  assert.equal(wrongOrder.response.status, 400)
  gatewayState.payment.order_id = currentOrderId

  gatewayState.payment.status = 'authorized'
  gatewayState.payment.captured = false
  const notCaptured = await confirmPayment()
  assert.equal(notCaptured.response.status, 409)
  assert.equal(notCaptured.data.status, 'pending')
  assert.equal(await Enrollment.countDocuments({ userId: users[0]._id, courseId: course._id }), 0)
})

test('paiement capturé crée une inscription unique, idempotente et privée', async () => {
  emailService.setTestEmailSender(async () => {
    const error = new Error('fake SMTP failure')
    error.code = 'ECONNECTION'
    throw error
  })
  gatewayState.payment.status = 'captured'
  gatewayState.payment.captured = true
  const [first, concurrent, second] = await Promise.all([
    confirmPayment(),
    confirmPayment(),
    confirmPayment(),
  ])
  for (const result of [first, concurrent, second]) {
    assert.equal(result.response.status, 200)
    assert.equal(result.data.status, 'enrolled')
  }
  assert.equal(await Enrollment.countDocuments({ userId: users[0]._id, courseId: course._id }), 1)
  assert.equal(await Payment.countDocuments({ userId: users[0]._id, courseId: course._id, status: 'captured' }), 1)
  assert.equal(await EmailNotification.countDocuments({
    userId: users[0]._id,
    kind: 'course-enrollment',
  }), 1)
  const failedNotification = await EmailNotification.findOne({
    userId: users[0]._id,
    kind: 'course-enrollment',
  }).lean()
  assert.equal(failedNotification.status, 'failed')
  assert.equal(failedNotification.attempts, 1)
  assert.equal(failedNotification.lastErrorCode, 'ECONNECTION')
  assert.equal((await Course.findById(course._id).select('+enrollmentCount')).enrollmentCount, 1)

  const deliveredMessages = []
  emailService.setTestEmailSender(async (message) => {
    deliveredMessages.push(message)
    return { messageId: 'test-delivery' }
  })
  const retryResult = await emailNotificationService.retryFailedEmailNotifications({
    notificationIds: [failedNotification._id],
  })
  assert.deepEqual(retryResult, { attempted: 1, sent: 1 })
  assert.equal(deliveredMessages.length, 1)
  assert.match(deliveredMessages[0].subject, /inscription au cours est confirmée/i)
  assert.equal((await EmailNotification.findById(failedNotification._id)).status, 'sent')

  await confirmPayment()
  assert.equal(await EmailNotification.countDocuments({
    userId: users[0]._id,
    kind: 'course-enrollment',
  }), 1)
  assert.equal(deliveredMessages.length, 1)

  const duplicateOrder = await createOrder()
  assert.equal(duplicateOrder.response.status, 409)

  const ownEnrollments = await request('/api/enrollments/me')
  assert.equal(ownEnrollments.data.enrollments.length, 1)
  assert.equal(ownEnrollments.data.enrollments[0].course.id, String(course._id))
  assert.equal(JSON.stringify(ownEnrollments.data).includes('videos.example.invalid'), false)
  const otherEnrollments = await request('/api/enrollments/me', { userIndex: 1 })
  assert.equal(otherEnrollments.data.enrollments.length, 0)

  const deleteAcquired = await request(`/api/admin/courses/${course._id}`, {
    method: 'DELETE',
    userIndex: 3,
    csrf: true,
  })
  assert.equal(deleteAcquired.response.status, 409)
  assert.match(deleteAcquired.data.message, /Archivez-le/)

  const archiveAcquired = await request(`/api/admin/courses/${course._id}/archive`, {
    method: 'PATCH',
    userIndex: 3,
    csrf: true,
  })
  assert.equal(archiveAcquired.response.status, 200)
  assert.equal(archiveAcquired.data.course.status, 'archived')
  const archivedCourse = await request(`/api/courses/${course._id}`)
  assert.equal(archivedCourse.response.status, 404)
  const archivedEnrollment = await request('/api/enrollments/me')
  assert.equal(archivedEnrollment.data.enrollments[0].course.status, 'archived')
})

test('une configuration absente ou de production échoue sans passer au paiement', async () => {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  delete process.env.RAZORPAY_KEY_ID
  delete process.env.RAZORPAY_KEY_SECRET
  await assert.rejects(
    razorpayService.createRazorpayOrder({ amount: 1, currency: 'INR', receipt: 'test', notes: {} }),
    /configurez RAZORPAY_KEY_ID et RAZORPAY_KEY_SECRET/,
  )
  process.env.RAZORPAY_KEY_ID = 'rzp_live_never-accepted'
  process.env.RAZORPAY_KEY_SECRET = keySecret
  await assert.rejects(
    razorpayService.createRazorpayOrder({ amount: 1, currency: 'INR', receipt: 'test', notes: {} }),
    /Seules les clés de test/,
  )
  process.env.RAZORPAY_KEY_ID = keyId
  process.env.RAZORPAY_KEY_SECRET = keySecret
})
