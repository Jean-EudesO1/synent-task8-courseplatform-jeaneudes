import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import {
  currentUser,
  issueCsrfToken,
  login,
  logout,
  register,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireCsrf } from '../middleware/requireCsrf.js'
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

router.get('/csrf', issueCsrfToken)
router.post('/register', authAttemptLimit, requireCsrf, validateRegistration, register)
router.post('/login', authAttemptLimit, requireCsrf, validateLogin, login)
router.get('/me', requireAuth, currentUser)
router.post('/logout', requireCsrf, logout)

export default router
