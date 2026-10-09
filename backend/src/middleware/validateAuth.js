const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistration(request, response, next) {
  const { name, email, password } = request.body || {}

  if (Object.hasOwn(request.body || {}, 'role')) {
    return response.status(400).json({ message: 'Le rôle est attribué par le serveur.' })
  }

  if (
    typeof name !== 'string'
    || name.trim().length < 2
    || name.trim().length > 80
    || typeof email !== 'string'
    || email.trim().length > 254
    || !emailPattern.test(email.trim())
    || typeof password !== 'string'
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    return response.status(400).json({
      message: 'Fournissez un nom (2 à 80 caractères), un e-mail valide et un mot de passe de 8 à 72 octets.',
    })
  }

  request.validatedAuth = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  }
  return next()
}

export function validateLogin(request, response, next) {
  const { email, password } = request.body || {}

  if (
    typeof email !== 'string'
    || email.trim().length > 254
    || !emailPattern.test(email.trim())
    || typeof password !== 'string'
    || password.length === 0
    || Buffer.byteLength(password, 'utf8') > 72
  ) {
    return response.status(400).json({ message: 'E-mail ou mot de passe invalide.' })
  }

  request.validatedAuth = { email: email.trim().toLowerCase(), password }
  return next()
}
