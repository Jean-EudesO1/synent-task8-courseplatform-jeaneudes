import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import app from '../src/app.js'
import { frontendUrl } from '../src/config.js'
import User from '../src/models/User.js'

process.env.JWT_SECRET ||= randomUUID() + randomUUID()

const email = `auth-test-${randomUUID()}@example.invalid`
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

  const setCookies = response.headers.getSetCookie()
  for (const cookie of setCookies) {
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

before(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI doit être configurée localement pour les tests d’intégration.')
  }
  await mongoose.connect(process.env.MONGODB_URI)
})

after(async () => {
  await User.deleteOne({ email })
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  await mongoose.disconnect()
})

test('inscription, connexion, session, CSRF, doublon, mauvais mot de passe et déconnexion', async () => {
  const csrf = await request('/api/auth/csrf')
  assert.equal(csrf.response.status, 200)
  csrfToken = csrf.data.csrfToken

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
