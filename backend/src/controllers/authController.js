import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import AuthToken from '../models/AuthToken.js'
import User from '../models/User.js'
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/emailService.js'
import { consumeToken, issueToken } from '../services/tokenService.js'
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
    emailVerified: user.emailVerified,
  }
}

export function issueCsrfToken(request, response) {
  const existingToken = request.cookies.csrf_token
  const token = existingToken && /^[A-Za-z0-9_-]{43}$/.test(existingToken)
    ? existingToken
    : randomBytes(32).toString('base64url')

  if (token !== existingToken) {
    response.cookie('csrf_token', token, csrfCookieOptions)
  }
  response.json({ csrfToken: token })
}

export async function register(request, response, next) {
  try {
    const { name, email, password } = request.validatedAuth
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({ name, email, passwordHash, role: 'student' })
    const token = await issueToken(user._id, 'email-verification', 24 * 60 * 60 * 1000)
    try {
      await sendVerificationEmail(user, token)
    } catch (error) {
      error.message = `Le compte a été créé, mais l’e-mail n’a pas pu être envoyé. Vous pourrez demander un nouvel envoi après connexion. ${error.message}`
      return next(error)
    }

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

export async function verifyEmail(request, response, next) {
  try {
    const authToken = await consumeToken(request.validatedToken, 'email-verification')
    const user = await User.findByIdAndUpdate(
      authToken.userId,
      { $set: { emailVerified: true } },
      { returnDocument: 'after' },
    )

    if (!user) {
      return response.status(400).json({ message: 'Ce lien de vérification est invalide.' })
    }

    await AuthToken.updateMany(
      {
        userId: user._id,
        purpose: 'email-verification',
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } },
    )

    return response.json({ message: 'Votre adresse e-mail est vérifiée.' })
  } catch (error) {
    return next(error)
  }
}

export async function resendVerification(request, response, next) {
  try {
    if (request.user.emailVerified) {
      return response.json({ message: 'Votre adresse e-mail est déjà vérifiée.' })
    }

    const token = await issueToken(
      request.user._id,
      'email-verification',
      24 * 60 * 60 * 1000,
    )
    await sendVerificationEmail(request.user, token)
    return response.json({ message: 'Un nouveau lien de vérification a été envoyé.' })
  } catch (error) {
    return next(error)
  }
}

export async function requestPasswordReset(request, response, next) {
  try {
    const user = await User.findOne({ email: request.validatedEmail })
    if (user) {
      const token = await issueToken(user._id, 'password-reset', 60 * 60 * 1000)
      try {
        await sendPasswordResetEmail(user, token)
      } catch (error) {
        console.error('Échec SMTP pour une demande de réinitialisation :', error.code || error.name)
      }
    }

    return response.json({
      message: 'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.',
    })
  } catch (error) {
    return next(error)
  }
}

export async function resetPassword(request, response, next) {
  try {
    const authToken = await consumeToken(request.validatedToken, 'password-reset')
    const passwordHash = await bcrypt.hash(request.validatedPassword, 12)
    const user = await User.findByIdAndUpdate(
      authToken.userId,
      {
        $set: { passwordHash },
        $inc: { tokenVersion: 1 },
      },
      { returnDocument: 'after' },
    )

    if (!user) {
      return response.status(400).json({ message: 'Ce lien de réinitialisation est invalide.' })
    }

    await AuthToken.updateMany(
      { userId: user._id, purpose: 'password-reset', consumedAt: null },
      { $set: { consumedAt: new Date() } },
    )

    response.clearCookie(authCookieName, {
      httpOnly: authCookieOptions.httpOnly,
      secure: authCookieOptions.secure,
      sameSite: authCookieOptions.sameSite,
      path: authCookieOptions.path,
    })
    return response.json({ message: 'Votre mot de passe a été modifié. Reconnectez-vous.' })
  } catch (error) {
    return next(error)
  }
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
