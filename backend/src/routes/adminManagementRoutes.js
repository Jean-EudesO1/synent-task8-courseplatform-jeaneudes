import { Router } from 'express'
import {
  listAdminEnrollments,
  listAdminUsers,
  sendDevelopmentTestEmail,
} from '../controllers/adminManagementController.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireCsrf } from '../middleware/requireCsrf.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(requireAuth, requireRole('admin'))
router.get('/users', listAdminUsers)
router.get('/enrollments', listAdminEnrollments)
router.post('/notifications/test-email', requireCsrf, sendDevelopmentTestEmail)

export default router
