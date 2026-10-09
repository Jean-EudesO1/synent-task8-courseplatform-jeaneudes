import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { authCookieName } from '../utils/auth.js'

export async function requireAuth(request, response, next) {
  const token = request.cookies[authCookieName]

  if (!token) {
    return response.status(401).json({ message: 'Vous devez vous connecter.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'synent-course-platform',
    })
    const user = await User.findById(payload.sub)

    if (!user || user.role !== payload.role) {
      return response.status(401).json({ message: 'Session invalide. Reconnectez-vous.' })
    }

    request.user = user
    return next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(401).json({ message: 'Session invalide ou expirée. Reconnectez-vous.' })
    }

    return next(error)
  }
}
