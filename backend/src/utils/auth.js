import jwt from 'jsonwebtoken'

export const authCookieName = 'course_session'
export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 60 * 60 * 1000,
}

export function assertAuthConfiguration() {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 octets. Configurez-le dans backend/.env.')
  }
}

export function createAuthToken(user) {
  assertAuthConfiguration()
  return jwt.sign(
    { role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { subject: String(user._id), expiresIn: '1h', issuer: 'synent-course-platform' },
  )
}
