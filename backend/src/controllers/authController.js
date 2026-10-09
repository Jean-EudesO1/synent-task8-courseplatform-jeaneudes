import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import User from '../models/User.js'
import {
  authCookieName,
  authCookieOptions,
  createAuthToken,
} from '../utils/auth.js'

const csrfCookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
}

function setSession(response, user) {
  response.cookie(authCookieName, createAuthToken(user), authCookieOptions)
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

export function issueCsrfToken(_request, response) {
  const token = randomBytes(32).toString('base64url')
  response.cookie('csrf_token', token, csrfCookieOptions)
  response.json({ csrfToken: token })
}

export async function register(request, response, next) {
  try {
    const { name, email, password } = request.validatedAuth
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({ name, email, passwordHash, role: 'student' })

    setSession(response, user)
    return response.status(201).json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ message: 'Un compte utilise déjà cette adresse e-mail.' })
    }

    return next(error)
  }
}

export async function login(request, response, next) {
  try {
    const { email, password } = request.validatedAuth
    const user = await User.findOne({ email }).select('+passwordHash')

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ message: 'E-mail ou mot de passe incorrect.' })
    }

    setSession(response, user)
    return response.json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
}

export function currentUser(request, response) {
  response.json({ user: publicUser(request.user) })
}

export function logout(_request, response) {
  response.clearCookie(authCookieName, {
    httpOnly: authCookieOptions.httpOnly,
    secure: authCookieOptions.secure,
    sameSite: authCookieOptions.sameSite,
    path: authCookieOptions.path,
  })
  response.status(204).end()
}
