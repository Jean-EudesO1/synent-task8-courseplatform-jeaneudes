const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const tokenPattern = /^[A-Za-z0-9_-]{43}$/

export function validateEmailRequest(request, response, next) {
  const email = request.body?.email
  if (
    typeof email !== 'string'
    || email.trim().length > 254
    || !emailPattern.test(email.trim())
  ) {
    return response.status(400).json({ message: 'Saisissez une adresse e-mail valide.' })
  }

  request.validatedEmail = email.trim().toLowerCase()
  return next()
}

export function validateEmailToken(request, response, next) {
  const token = request.body?.token
  if (typeof token !== 'string' || !tokenPattern.test(token)) {
    return response.status(400).json({
      message: 'Ce lien est invalide ou incomplet. Ouvrez le lien reçu par e-mail.',
    })
  }

  request.validatedToken = token
  return next()
}

export function validatePasswordReset(request, response, next) {
  const token = request.body?.token
  const { password, confirmPassword } = request.body || {}
  if (typeof token !== 'string' || !tokenPattern.test(token)) {
    return response.status(400).json({
      message: 'Ce lien est invalide ou incomplet. Ouvrez le lien reçu par e-mail.',
    })
  }
  if (
    typeof password !== 'string'
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
    || password !== confirmPassword
  ) {
    return response.status(400).json({
      message: 'Le mot de passe doit contenir entre 8 et 72 octets et correspondre à sa confirmation.',
    })
  }

  request.validatedToken = token
  request.validatedPassword = password
  return next()
}
