import mongoose from 'mongoose'
import Course from '../models/Course.js'
import EmailNotification from '../models/EmailNotification.js'
import Enrollment from '../models/Enrollment.js'
import Payment from '../models/Payment.js'
import User from '../models/User.js'
import { deliverEmailNotification } from '../services/emailNotificationService.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MAX_OFFSET = 1_000_000

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page)
  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit)
  if (
    !Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT
  ) return null
  const skip = (page - 1) * limit
  if (!Number.isSafeInteger(skip) || skip > MAX_OFFSET) return null
  return { page, limit, skip }
}

function paginationResult(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) }
}

export async function listAdminUsers(request, response, next) {
  try {
    const pagination = parsePagination(request.query)
    if (!pagination) {
      return response.status(400).json({ message: 'Les paramètres de pagination sont invalides.' })
    }

    const { q, role, emailVerified } = request.query
    if (
      (role !== undefined && !['student', 'admin'].includes(role))
      || (emailVerified !== undefined && !['true', 'false'].includes(emailVerified))
    ) {
      return response.status(400).json({ message: 'Les filtres utilisateurs sont invalides.' })
    }

    const filter = {}
    if (role) filter.role = role
    if (emailVerified !== undefined) filter.emailVerified = emailVerified === 'true'
    if (typeof q === 'string' && q.trim()) {
      const pattern = new RegExp(escapeRegExp(q.trim().slice(0, 100)), 'i')
      filter.$or = [{ name: pattern }, { email: pattern }]
    } else if (q !== undefined && typeof q !== 'string') {
      return response.status(400).json({ message: 'Le terme de recherche est invalide.' })
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email role emailVerified createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      User.countDocuments(filter),
    ])
    return response.json({
      users: users.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified === true,
        createdAt: user.createdAt,
      })),
      pagination: paginationResult(pagination.page, pagination.limit, total),
    })
  } catch (error) {
    return next(error)
  }
}

export async function listAdminEnrollments(request, response, next) {
  try {
    const pagination = parsePagination(request.query)
    if (!pagination) {
      return response.status(400).json({ message: 'Les paramètres de pagination sont invalides.' })
    }

    const { q, source, paymentStatus, userId, courseId } = request.query
    if (
      (source !== undefined && !['payment', 'development-test'].includes(source))
      || (paymentStatus !== undefined && !['created', 'authorized', 'captured'].includes(paymentStatus))
      || (userId !== undefined && !mongoose.isValidObjectId(userId))
      || (courseId !== undefined && !mongoose.isValidObjectId(courseId))
      || (q !== undefined && typeof q !== 'string')
    ) {
      return response.status(400).json({ message: 'Les filtres d’inscription sont invalides.' })
    }

    const filter = {}
    if (source) filter.source = source
    if (userId) filter.userId = userId
    if (courseId) filter.courseId = courseId

    if (paymentStatus) {
      const matchingPayments = await Payment.find({ status: paymentStatus }).select('_id').lean()
      filter.paymentId = { $in: matchingPayments.map((payment) => payment._id) }
    }

    if (typeof q === 'string' && q.trim()) {
      const pattern = new RegExp(escapeRegExp(q.trim().slice(0, 100)), 'i')
      const [users, courses] = await Promise.all([
        User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id').lean(),
        Course.find({ title: pattern }).select('_id').lean(),
      ])
      filter.$or = [
        { userId: { $in: users.map((user) => user._id) } },
        { courseId: { $in: courses.map((course) => course._id) } },
      ]
    }

    const [enrollments, total] = await Promise.all([
      Enrollment.find(filter)
        .populate({ path: 'userId', select: 'name email role emailVerified createdAt' })
        .populate({ path: 'courseId', select: 'title status modules._id modules.lessons._id' })
        .populate({ path: 'paymentId', select: 'amount currency status capturedAt' })
        .sort({ enrolledAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      Enrollment.countDocuments(filter),
    ])

    const results = enrollments
      .filter((enrollment) => enrollment.userId && enrollment.courseId)
      .map((enrollment) => {
        const course = enrollment.courseId
        const currentLessonIds = new Set(
          (course.modules || []).flatMap((module) =>
            (module.lessons || []).map((lesson) => String(lesson._id))),
        )
        const completedIds = new Set(
          (enrollment.completedLessonIds || [])
            .map(String)
            .filter((lessonId) => currentLessonIds.has(lessonId)),
        )
        const totalLessons = currentLessonIds.size
        const sourceValue = enrollment.source || 'payment'
        const payment = sourceValue === 'payment' ? enrollment.paymentId : null
        return {
          id: String(enrollment._id),
          enrolledAt: enrollment.enrolledAt,
          source: sourceValue,
          user: {
            id: String(enrollment.userId._id),
            name: enrollment.userId.name,
            email: enrollment.userId.email,
          },
          course: {
            id: String(course._id),
            title: course.title,
            status: course.status,
          },
          progress: {
            completedCount: completedIds.size,
            totalCount: totalLessons,
            percentage: totalLessons ? Math.round((completedIds.size / totalLessons) * 100) : 0,
          },
          payment: payment
            ? {
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              capturedAt: payment.capturedAt || null,
            }
            : null,
        }
      })

    return response.json({
      enrollments: results,
      pagination: paginationResult(pagination.page, pagination.limit, total),
    })
  } catch (error) {
    return next(error)
  }
}

export async function sendDevelopmentTestEmail(request, response, next) {
  try {
    const recipient = typeof request.body?.email === 'string'
      ? request.body.email.trim().toLowerCase()
      : ''
    if (
      Object.keys(request.body || {}).some((key) => key !== 'email')
      || recipient.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
    ) {
      return response.status(400).json({ message: 'Adresse de test invalide.' })
    }
    if (process.env.NODE_ENV !== 'development') {
      return response.status(403).json({ message: 'Cette action est réservée à l’environnement de développement.' })
    }

    const notification = await EmailNotification.create({
      kind: 'test',
      recipient,
      dedupeKey: `manual-test:${new mongoose.Types.ObjectId()}`,
    })
    await deliverEmailNotification(notification._id)
    const current = await EmailNotification.findById(notification._id).select('status').lean()
    return response.status(current?.status === 'sent' ? 202 : 503).json({
      status: current?.status || 'pending',
      message: current?.status === 'sent'
        ? 'E-mail de test envoyé ; son objet et son contenu l’identifient clairement comme un test.'
        : 'L’e-mail de test est enregistré mais n’a pas pu être envoyé. Il pourra être relancé.',
    })
  } catch (error) {
    return next(error)
  }
}
