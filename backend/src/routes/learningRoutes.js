import { Router } from 'express'
import {
  getLearningCourse,
  updateLessonProgress,
} from '../controllers/learningController.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireCsrf } from '../middleware/requireCsrf.js'

const router = Router()

router.use(requireAuth)
router.get('/courses/:courseId', getLearningCourse)
router.patch('/courses/:courseId/progress', requireCsrf, updateLessonProgress)

export default router
