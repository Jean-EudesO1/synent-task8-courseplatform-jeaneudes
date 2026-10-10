import { Router } from 'express'
import {
  confirmCoursePayment,
  createCourseOrder,
  listMyEnrollments,
} from '../controllers/paymentController.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireCsrf } from '../middleware/requireCsrf.js'
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js'

const router = Router()

router.get('/enrollments/me', requireAuth, listMyEnrollments)
router.post(
  '/orders',
  requireCsrf,
  requireAuth,
  requireVerifiedEmail,
  createCourseOrder,
)
router.post(
  '/confirm',
  requireCsrf,
  requireAuth,
  requireVerifiedEmail,
  confirmCoursePayment,
)

export default router
