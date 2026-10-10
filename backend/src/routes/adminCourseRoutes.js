import { Router } from 'express'
import {
  createAdminCourse,
  deleteAdminCourse,
  listAdminCourses,
  updateAdminCourse,
} from '../controllers/adminCourseController.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireCsrf } from '../middleware/requireCsrf.js'
import { requireRole } from '../middleware/requireRole.js'
import { validateAdminCourse } from '../middleware/validateAdminCourse.js'

const router = Router()

router.use(requireAuth, requireRole('admin'))
router.get('/', listAdminCourses)
router.post('/', requireCsrf, validateAdminCourse, createAdminCourse)
router.put('/:id', requireCsrf, validateAdminCourse, updateAdminCourse)
router.delete('/:id', requireCsrf, deleteAdminCourse)

export default router
