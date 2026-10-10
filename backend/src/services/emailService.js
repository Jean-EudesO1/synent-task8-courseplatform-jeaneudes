import nodemailer from 'nodemailer'

const isTestTransport = process.env.NODE_ENV === 'test'
export const testEmailOutbox = isTestTransport ? [] : undefined

const testTransport = isTestTransport
  ? {
      async sendMail(message) {
        testEmailOutbox.push(message)
        return { messageId: `test-${testEmailOutbox.length}` }
      },
    }
  : null
let smtpTransport

export function createGmailTransportOptions(env = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !EMAIL_FROM) {
    const error = new Error(
      'Configuration SMTP Gmail incomplète. Renseignez SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD et EMAIL_FROM dans backend/.env.',
    )
    error.status = 503
    throw error
  }
  if (SMTP_USER.toLowerCase() !== EMAIL_FROM.toLowerCase()) {
    const error = new Error('SMTP_USER et EMAIL_FROM doivent correspondre à la même adresse Gmail.')
    error.status = 503
    throw error
  }
  if (SMTP_HOST !== 'smtp.gmail.com' || Number(SMTP_PORT) !== 587 || SMTP_SECURE !== 'false') {
    const error = new Error('Gmail doit utiliser smtp.gmail.com:587 avec SMTP_SECURE=false et STARTTLS obligatoire.')
    error.status = 503
    throw error
  }

  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    requireTLS: true,
    logger: false,
    debug: false,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  }
}

function getTransport() {
  if (testTransport) return testTransport
  if (smtpTransport) return smtpTransport

  smtpTransport = nodemailer.createTransport(createGmailTransportOptions())
  return smtpTransport
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM

  try {
    await getTransport().sendMail({
      from: from || 'student@example.test',
      to,
      subject,
      text,
      html,
    })
  } catch (error) {
    if (error.status) throw error
    console.error('Échec de livraison SMTP :', error.code || error.name)
    const deliveryError = new Error('Le message n’a pas pu être envoyé. Vérifiez la configuration SMTP et réessayez.')
    deliveryError.status = 503
    throw deliveryError
  }
}

export async function sendVerificationEmail(user, token) {
  const link = new URL('/verify-email', process.env.FRONTEND_URL || 'http://localhost:5173')
  link.searchParams.set('token', token)
  const name = escapeHtml(user.name)

  await sendEmail({
    to: user.email,
    subject: 'Vérifiez votre adresse e-mail',
    text: `Bonjour ${user.name}, confirmez votre adresse e-mail en ouvrant ce lien : ${link.href}`,
    html: `<p>Bonjour ${name},</p><p><a href="${link.href}">Vérifier mon adresse e-mail</a></p><p>Ce lien expire dans 24 heures.</p>`,
  })
}

export async function sendPasswordResetEmail(user, token) {
  const link = new URL('/reset-password', process.env.FRONTEND_URL || 'http://localhost:5173')
  link.searchParams.set('token', token)
  const name = escapeHtml(user.name)

  await sendEmail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe',
    text: `Bonjour ${user.name}, réinitialisez votre mot de passe en ouvrant ce lien : ${link.href}`,
    html: `<p>Bonjour ${name},</p><p><a href="${link.href}">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans une heure. Ignorez ce message si vous n’avez pas demandé de réinitialisation.</p>`,
  })
}
