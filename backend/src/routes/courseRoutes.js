import { Router } from 'express'
import { getCourse, listCourses } from '../controllers/courseController.js'
import { validateCourseQuery } from '../middleware/validateCourseQuery.js'

const router = Router()

router.get('/', validateCourseQuery, listCourses)
router.get('/:id', getCourse)

export default router
