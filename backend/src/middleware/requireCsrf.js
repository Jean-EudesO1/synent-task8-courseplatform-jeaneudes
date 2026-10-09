import { timingSafeEqual } from 'node:crypto'
import { frontendUrl } from '../config.js'

export function requireCsrf(request, response, next) {
  const cookieToken = request.cookies.csrf_token
  const headerToken = request.get('x-csrf-token')
  const cookieBytes = Buffer.from(cookieToken || '')
  const headerBytes = Buffer.from(headerToken || '')

  if (
    request.get('origin') !== frontendUrl
    || !cookieBytes.length
    || !headerBytes.length
    || cookieBytes.length !== headerBytes.length
    || !timingSafeEqual(cookieBytes, headerBytes)
  ) {
    return response.status(403).json({ message: 'Jeton CSRF absent ou invalide. Rechargez la page.' })
  }

  return next()
}
