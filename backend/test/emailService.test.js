import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.NODE_ENV = 'test'

const {
  createGmailTransportOptions,
  sendCourseEnrollmentEmail,
  sendTestNotificationEmail,
  sendVerificationEmail,
  testEmailOutbox,
} =
  await import('../src/services/emailService.js')

test('configure Nodemailer pour Gmail avec STARTTLS obligatoire', () => {
  const options = createGmailTransportOptions({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'student@gmail.com',
    SMTP_PASSWORD: 'example-app-password',
    EMAIL_FROM: 'student@gmail.com',
  })

  assert.equal(options.host, 'smtp.gmail.com')
  assert.equal(options.port, 587)
  assert.equal(options.secure, false)
  assert.equal(options.requireTLS, true)
  assert.equal(options.logger, false)
  assert.equal(options.debug, false)
  assert.deepEqual(options.auth, {
    user: 'student@gmail.com',
    pass: 'example-app-password',
  })
})

test('refuse une configuration SMTP incomplète sans exposer de valeur secrète', () => {
  assert.throws(
    () => createGmailTransportOptions({ SMTP_USER: 'student@gmail.com' }),
    (error) => {
      assert.equal(error.status, 503)
      assert.match(error.message, /SMTP_HOST/)
      assert.doesNotMatch(error.message, /student@gmail\.com/)
      return true
    },
  )
})

test('exige le même expéditeur et utilisateur SMTP', () => {
  assert.throws(
    () => createGmailTransportOptions({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'sender@gmail.com',
      SMTP_PASSWORD: 'example-app-password',
      EMAIL_FROM: 'different@gmail.com',
    }),
    /SMTP_USER et EMAIL_FROM doivent correspondre/,
  )
})

test('refuse un serveur SMTP ou un mode TLS différents de Gmail STARTTLS', () => {
  assert.throws(
    () => createGmailTransportOptions({
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'sender@gmail.com',
      SMTP_PASSWORD: 'example-app-password',
      EMAIL_FROM: 'sender@gmail.com',
    }),
    /Gmail doit utiliser smtp\.gmail\.com:587/,
  )
})

test('conserve la boîte d’envoi factice en tests sans SMTP', async () => {
  testEmailOutbox.length = 0
  await sendVerificationEmail(
    { name: 'Test Student', email: 'student@example.test' },
    'fake-verification-token',
  )

  assert.equal(testEmailOutbox.length, 1)
  assert.equal(testEmailOutbox[0].to, 'student@example.test')
  assert.match(testEmailOutbox[0].text, /verify-email/)
})

test('différencie une confirmation de cours d’un e-mail de test', async () => {
  testEmailOutbox.length = 0
  await sendCourseEnrollmentEmail(
    { name: 'Test Student', email: 'student@example.test' },
    { title: 'Cours de démonstration' },
  )
  await sendTestNotificationEmail('student@example.test')

  assert.equal(testEmailOutbox.length, 2)
  assert.match(testEmailOutbox[0].subject, /inscription au cours est confirmée/i)
  assert.match(testEmailOutbox[0].text, /Cours de démonstration/)
  assert.match(testEmailOutbox[1].subject, /^\[TEST\]/)
  assert.match(testEmailOutbox[1].text, /Aucune inscription ni aucun paiement/)
})
