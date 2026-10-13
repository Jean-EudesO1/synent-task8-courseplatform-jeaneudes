import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { configureDnsServers } from '../src/utils/dnsConfig.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET ||= randomUUID() + randomUUID()

const [{ default: app }, { frontendUrl }, { default: User }, { default: AuthToken }, { testEmailOutbox }] =
  await Promise.all([
    import('../src/app.js'),
    import('../src/config.js'),
    import('../src/models/User.js'),
    import('../src/models/AuthToken.js'),
    import('../src/services/emailService.js'),
  ])

const email = `auth-test-${randomUUID()}@example.invalid`
const verificationEmail = `verification-test-${randomUUID()}@example.invalid`
const password = 'test-password-42'
const origin = frontendUrl
const server = app.listen(0)
const baseUrl = await new Promise((resolve) => {
  server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`))
})
let csrfToken
let cookies = ''

async function request(path, {
  method = 'GET',
  body,
  csrf = false,
  session = true,
  cookieOverride,
} = {}) {
  const cookieHeader = cookieOverride || cookies
    .split('; ')
    .filter((stored) => stored && (
      stored.startsWith('csrf_token=')
      || (session && stored.startsWith('course_session='))
    ))
    .join('; ')
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const name = pair.split('=', 1)[0]
    cookies = cookies
      .split('; ')
      .filter((stored) => stored && stored.split('=', 1)[0] !== name)
      .concat(pair)
      .join('; ')
  }

  return {
    response,
    data: response.status === 204 ? null : await response.json(),
  }
}

function tokenFromLastEmail() {
  const message = testEmailOutbox.at(-1)
  assert.ok(message, 'un message de test doit avoir été envoyé')
  const link = message.text.match(/https?:\/\/\S+/)?.[0]
  assert.ok(link, 'le message doit contenir un lien')
  return new URL(link).searchParams.get('token')
}

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  configureDnsServers()
  await mongoose.connect(process.env.MONGODB_URI)
})

after(async () => {
  const users = await User.find({ email: { $in: [email, verificationEmail] } }).select('_id')
  await AuthToken.deleteMany({ userId: { $in: users.map((user) => user._id) } })
  await User.deleteMany({ email: { $in: [email, verificationEmail] } })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('inscription, connexion, session, CSRF, doublon, mauvais mot de passe et déconnexion', async () => {
  const csrf = await request('/api/auth/csrf')
  assert.equal(csrf.response.status, 200)
  csrfToken = csrf.data.csrfToken
  const csrfForSecondTab = await request('/api/auth/csrf')
  assert.equal(csrfForSecondTab.data.csrfToken, csrfToken)
  assert.equal(csrfForSecondTab.response.headers.get('set-cookie'), null)

  const anonymous = await request('/api/auth/me', { session: false })
  assert.equal(anonymous.response.status, 401)

  const missingCsrf = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Test Student', email, password },
    session: false,
  })
  assert.equal(missingCsrf.response.status, 403)

  cookies = cookies.split('; ')
    .filter((stored) => !stored.startsWith('csrf_token='))
    .join('; ')
  const missingCsrfCookie = await request('/api/auth/register', {
    method: 'POST',
    csrf: true,
    body: { name: 'Test Student', email, password },
    session: false,
  })
  assert.equal(missingCsrfCookie.response.status, 403)
  const csrfBootstrap = await request('/api/auth/csrf')
  csrfToken = csrfBootstrap.data.csrfToken

  const roleEscalation = await request('/api/auth/register', {
    method: 'POST',
    csrf: true,
    body: { name: 'Test Student', email, password, role: 'admin' },
    session: false,
  })
  assert.equal(roleEscalation.response.status, 400)

  const registration = await request('/api/auth/register', {
    method: 'POST',
    csrf: true,
    body: { name: 'Test Student', email: email.toUpperCase(), password },
    session: false,
  })
  assert.equal(registration.response.status, 201)
  assert.equal(registration.data.user.email, email)
  assert.equal(registration.data.user.role, 'student')
  assert.equal(registration.data.user.emailVerified, false)
  assert.equal('passwordHash' in registration.data.user, false)
  assert.equal('password' in registration.data.user, false)
  assert.match(registration.response.headers.get('set-cookie'), /HttpOnly/i)

  const storedUser = await User.findOne({ email }).select('+passwordHash')
  assert.ok(storedUser.passwordHash.startsWith('$2'))
  assert.notEqual(storedUser.passwordHash, password)

  const duplicate = await request('/api/auth/register', {
    method: 'POST',
    csrf: true,
    body: { name: 'Test Student', email, password },
    session: false,
  })
  assert.equal(duplicate.response.status, 409)

  const loggedOut = await request('/api/auth/logout', {
    method: 'POST',
    csrf: true,
    session: false,
  })
  assert.equal(loggedOut.response.status, 204)

  const login = await request('/api/auth/login', {
    method: 'POST',
    csrf: true,
    body: { email: email.toUpperCase(), password },
    session: false,
  })
  assert.equal(login.response.status, 200)
  assert.equal(login.data.user.name, 'Test Student')
  assert.equal(login.data.user.emailVerified, false)
  assert.equal('passwordHash' in login.data.user, false)

  const current = await request('/api/auth/me')
  assert.equal(current.response.status, 200)
  assert.equal(current.data.user.email, email)

  const expiredToken = jwt.sign(
    { role: 'student' },
    process.env.JWT_SECRET,
    {
      subject: String(storedUser._id),
      expiresIn: -1,
      issuer: 'synent-course-platform',
    },
  )
  const expiredSession = await request('/api/auth/me', {
    cookieOverride: `course_session=${expiredToken}`,
  })
  assert.equal(expiredSession.response.status, 401)

  const badPassword = await request('/api/auth/login', {
    method: 'POST',
    csrf: true,
    body: { email, password: 'incorrect-password' },
    session: false,
  })
  assert.equal(badPassword.response.status, 401)

  const logout = await request('/api/auth/logout', { method: 'POST', csrf: true })
  assert.equal(logout.response.status, 204)

  const afterLogout = await request('/api/auth/me')
  assert.equal(afterLogout.response.status, 401)
})

test('vérification e-mail, réinitialisation, expiration, réutilisation et invalidation JWT', async () => {
  testEmailOutbox.length = 0
  const csrf = await request('/api/auth/csrf')
  csrfToken = csrf.data.csrfToken

  const registration = await request('/api/auth/register', {
    method: 'POST',
    csrf: true,
    session: false,
    body: { name: 'Verification Test', email: verificationEmail, password },
  })
  assert.equal(registration.response.status, 201)
  assert.equal(registration.data.user.emailVerified, false)
  assert.equal(testEmailOutbox.length, 1)
  assert.equal(testEmailOutbox[0].to, verificationEmail)
  assert.equal(testEmailOutbox[0].subject, 'Vérifiez votre adresse e-mail')

  const originalVerificationToken = tokenFromLastEmail()
  const storedVerification = await AuthToken.findOne({
    userId: registration.data.user.id,
    purpose: 'email-verification',
  })
  assert.notEqual(storedVerification.tokenHash, originalVerificationToken)

  const resend = await request('/api/auth/verification/resend', {
    method: 'POST',
    csrf: true,
  })
  assert.equal(resend.response.status, 200)
  assert.equal(testEmailOutbox.length, 2)
  const verificationToken = tokenFromLastEmail()

  const replacedToken = await request('/api/auth/verify-email', {
    method: 'POST',
    csrf: true,
    body: { token: originalVerificationToken },
  })
  assert.equal(replacedToken.response.status, 400)
  assert.match(replacedToken.data.message, /déjà été utilisé ou remplacé/)

  const expiredVerificationToken = randomBytes(32).toString('base64url')
  await AuthToken.create({
    userId: registration.data.user.id,
    purpose: 'email-verification',
    tokenHash: createHash('sha256').update(expiredVerificationToken).digest('hex'),
    expiresAt: new Date(Date.now() - 1000),
  })
  const expiredVerification = await request('/api/auth/verify-email', {
    method: 'POST',
    csrf: true,
    body: { token: expiredVerificationToken },
  })
  assert.equal(expiredVerification.response.status, 400)
  assert.match(expiredVerification.data.message, /a expiré/)

  const verified = await request('/api/auth/verify-email', {
    method: 'POST',
    csrf: true,
    body: { token: verificationToken },
  })
  assert.equal(verified.response.status, 200)
  assert.equal((await User.findById(registration.data.user.id)).emailVerified, true)
  const refreshedSession = await request('/api/auth/me')
  assert.equal(refreshedSession.response.status, 200)
  assert.equal(refreshedSession.data.user.emailVerified, true)

  const reusedVerification = await request('/api/auth/verify-email', {
    method: 'POST',
    csrf: true,
    body: { token: verificationToken },
  })
  assert.equal(reusedVerification.response.status, 400)
  assert.match(reusedVerification.data.message, /déjà été utilisé ou remplacé/)

  const sessionCookie = cookies.split('; ')
    .find((stored) => stored.startsWith('course_session='))
  assert.ok(sessionCookie)

  const unknownEmail = await request('/api/auth/forgot-password', {
    method: 'POST',
    csrf: true,
    session: false,
    body: { email: `unknown-${verificationEmail}` },
  })
  const existingEmail = await request('/api/auth/forgot-password', {
    method: 'POST',
    csrf: true,
    session: false,
    body: { email: verificationEmail },
  })
  assert.equal(unknownEmail.response.status, 200)
  assert.equal(existingEmail.response.status, 200)
  assert.deepEqual(existingEmail.data, unknownEmail.data)
  assert.equal(testEmailOutbox.length, 3)

  const resetToken = tokenFromLastEmail()
  const reset = await request('/api/auth/reset-password', {
    method: 'POST',
    csrf: true,
    session: false,
    body: {
      token: resetToken,
      password: 'new-password-84',
      confirmPassword: 'new-password-84',
    },
  })
  assert.equal(reset.response.status, 200)
  assert.match(reset.data.message, /mot de passe a été modifié/)

  const invalidatedSession = await request('/api/auth/me', {
    cookieOverride: `${sessionCookie}; csrf_token=${csrfToken}`,
  })
  assert.equal(invalidatedSession.response.status, 401)

  const reusedReset = await request('/api/auth/reset-password', {
    method: 'POST',
    csrf: true,
    session: false,
    body: {
      token: resetToken,
      password: 'another-password-82',
      confirmPassword: 'another-password-82',
    },
  })
  assert.equal(reusedReset.response.status, 400)
  assert.match(reusedReset.data.message, /déjà été utilisé ou remplacé/)

  const expiredResetRequest = await request('/api/auth/forgot-password', {
    method: 'POST',
    csrf: true,
    session: false,
    body: { email: verificationEmail },
  })
  assert.equal(expiredResetRequest.response.status, 200)
  const expiredResetToken = tokenFromLastEmail()
  const expiredResetHash = createHash('sha256').update(expiredResetToken).digest('hex')
  await AuthToken.updateOne(
    { tokenHash: expiredResetHash },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  )
  const expiredReset = await request('/api/auth/reset-password', {
    method: 'POST',
    csrf: true,
    session: false,
    body: {
      token: expiredResetToken,
      password: 'another-password-82',
      confirmPassword: 'another-password-82',
    },
  })
  assert.equal(expiredReset.response.status, 400)
  assert.match(expiredReset.data.message, /a expiré/)

  const loginWithNewPassword = await request('/api/auth/login', {
    method: 'POST',
    csrf: true,
    session: false,
    body: { email: verificationEmail, password: 'new-password-84' },
  })
  assert.equal(loginWithNewPassword.response.status, 200)

  const loginWithOldPassword = await request('/api/auth/login', {
    method: 'POST',
    csrf: true,
    session: false,
    body: { email: verificationEmail, password },
  })
  assert.equal(loginWithOldPassword.response.status, 401)
})
