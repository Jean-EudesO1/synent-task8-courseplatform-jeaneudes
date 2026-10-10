import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import {
  currentUser,
  issueCsrfToken,
  login,
  logout,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireCsrf } from '../middleware/requireCsrf.js'
import {
  validateEmailRequest,
  validateEmailToken,
  validatePasswordReset,
} from '../middleware/validateEmailActions.js'
import {
  validateLogin,
  validateRegistration,
} from '../middleware/validateAuth.js'

const router = Router()
const authAttemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
})
const verificationLinkLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Trop de demandes par e-mail. Réessayez dans une heure.' },
})
const passwordResetRequestLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Trop de demandes de réinitialisation. Réessayez dans une heure.' },
})
const passwordResetAttemptLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives de réinitialisation. Réessayez dans une heure.' },
})
const verificationResendLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Trop de demandes de vérification. Réessayez dans une heure.' },
})

router.get('/csrf', issueCsrfToken)
router.post('/register', authAttemptLimit, requireCsrf, validateRegistration, register)
router.post('/login', authAttemptLimit, requireCsrf, validateLogin, login)
router.get('/me', requireAuth, currentUser)
router.post('/logout', requireCsrf, logout)
router.post('/verify-email', verificationLinkLimit, requireCsrf, validateEmailToken, verifyEmail)
router.post(
  '/verification/resend',
  verificationResendLimit,
  requireCsrf,
  requireAuth,
  resendVerification,
)
router.post(
  '/forgot-password',
  passwordResetRequestLimit,
  requireCsrf,
  validateEmailRequest,
  requestPasswordReset,
)
router.post(
  '/reset-password',
  passwordResetAttemptLimit,
  requireCsrf,
  validatePasswordReset,
  resetPassword,
)

export default router
