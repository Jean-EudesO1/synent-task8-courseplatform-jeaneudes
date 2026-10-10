import assert from 'node:assert/strict'
import test from 'node:test'
import { requireVerifiedEmail } from '../src/middleware/requireVerifiedEmail.js'

test('refuse une future inscription à un cours si l’e-mail n’est pas vérifié', () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  let nextCalled = false

  requireVerifiedEmail(
    { user: { emailVerified: false } },
    response,
    () => { nextCalled = true },
  )

  assert.equal(response.statusCode, 403)
  assert.match(response.body.message, /Vérifiez votre adresse e-mail/)
  assert.equal(nextCalled, false)
})

test('autorise les accès protégés par e-mail après vérification', () => {
  let nextCalled = false

  requireVerifiedEmail(
    { user: { emailVerified: true } },
    {},
    () => { nextCalled = true },
  )

  assert.equal(nextCalled, true)
})
