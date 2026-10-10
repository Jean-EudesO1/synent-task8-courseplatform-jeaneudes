import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import Course from '../models/Course.js'
import Enrollment from '../models/Enrollment.js'
import Payment from '../models/Payment.js'
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  verifyRazorpaySignature,
} from '../services/razorpayService.js'

export async function createCourseOrder(request, response, next) {
  try {
    const { courseId } = request.body || {}
    if (Object.keys(request.body || {}).some((key) => key !== 'courseId')) {
      return response.status(400).json({ message: 'Seul l’identifiant du cours est accepté pour créer une commande.' })
    }
    if (!mongoose.isValidObjectId(courseId)) {
      return response.status(400).json({ message: 'Identifiant de cours invalide.' })
    }
    const course = await Course.findOne({ _id: courseId, status: 'published' })
      .select('title price currency')
      .lean()
    if (!course) return response.status(404).json({ message: 'Cours introuvable ou non publié.' })

    const existingEnrollment = await Enrollment.findOne({
      userId: request.user._id,
      courseId: course._id,
    }).lean()
    if (existingEnrollment) {
      return response.status(409).json({ message: 'Vous êtes déjà inscrit à ce cours.' })
    }

    const pendingOrder = await Payment.findOne({
      userId: request.user._id,
      courseId: course._id,
      status: { $in: ['created', 'authorized'] },
    }).sort({ createdAt: -1 }).lean()
    if (pendingOrder) {
      return response.json({
        keyId: getRazorpayKeyId(),
        order: {
          id: pendingOrder.razorpayOrderId,
          amount: pendingOrder.amount,
          currency: pendingOrder.currency,
        },
        course: { id: String(course._id), title: course.title },
      })
    }

    const { order, keyId } = await createRazorpayOrder({
      amount: course.price,
      currency: course.currency,
      receipt: randomUUID().replace(/-/g, '').slice(0, 40),
      notes: {
        userId: String(request.user._id),
        courseId: String(course._id),
      },
    })
    if (
      !order?.id
      || order.amount !== course.price
      || order.currency !== course.currency
    ) {
      const error = new Error('Le service de paiement a renvoyé une commande incohérente.')
      error.status = 502
      throw error
    }

    try {
      await Payment.create({
        userId: request.user._id,
        courseId: course._id,
        razorpayOrderId: order.id,
        amount: course.price,
        currency: course.currency,
        status: 'created',
      })
    } catch (error) {
      if (error.code === 11000) {
        const existing = await Payment.findOne({
          userId: request.user._id,
          courseId: course._id,
          status: { $in: ['created', 'authorized'] },
        }).sort({ createdAt: -1 }).lean()
        if (existing) {
          return response.json({
            keyId,
            order: { id: existing.razorpayOrderId, amount: existing.amount, currency: existing.currency },
            course: { id: String(course._id), title: course.title },
          })
        }
      }
      throw error
    }
    return response.status(201).json({
      keyId,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      course: { id: String(course._id), title: course.title },
    })
  } catch (error) {
    return next(error)
  }
}

export async function confirmCoursePayment(request, response, next) {
  const session = await mongoose.startSession()
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } =
      request.body || {}
    if (
      typeof orderId !== 'string' || orderId.length > 100
      || typeof paymentId !== 'string' || paymentId.length > 100
      || typeof signature !== 'string' || signature.length > 128
    ) {
      return response.status(400).json({ message: 'Données de confirmation de paiement invalides.' })
    }

    const payment = await Payment.findOne({
      razorpayOrderId: orderId,
      userId: request.user._id,
    })
    if (!payment) {
      return response.status(404).json({ message: 'Commande de paiement introuvable pour cette session.' })
    }
    if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
      return response.status(400).json({ message: 'La signature du paiement est invalide.' })
    }

    const gatewayPayment = await fetchRazorpayPayment(paymentId)
    if (
      gatewayPayment.id !== paymentId
      || gatewayPayment.order_id !== orderId
      || gatewayPayment.amount !== payment.amount
      || gatewayPayment.currency !== payment.currency
    ) {
      return response.status(400).json({ message: 'Les informations du paiement ne correspondent pas à la commande.' })
    }
    if (gatewayPayment.status !== 'captured' || gatewayPayment.captured !== true) {
      if (gatewayPayment.status === 'authorized') {
        await Payment.updateOne(
          { _id: payment._id, status: { $ne: 'captured' } },
          { $set: { status: 'authorized', razorpayPaymentId: paymentId } },
        )
      }
      return response.status(409).json({
        status: 'pending',
        message: 'Le paiement n’est pas encore capturé par Razorpay. Aucun accès n’a été accordé ; réessayez la confirmation dans un instant.',
      })
    }

    let enrollment
    await session.withTransaction(async () => {
      const confirmedPayment = await Payment.findOneAndUpdate(
        { razorpayOrderId: orderId, userId: request.user._id },
        {
          $set: {
            razorpayPaymentId: paymentId,
            status: 'captured',
            capturedAt: new Date(),
          },
        },
        { returnDocument: 'after', runValidators: true, session },
      )
      if (!confirmedPayment) {
        const error = new Error('Commande de paiement introuvable.')
        error.status = 404
        throw error
      }

      enrollment = await Enrollment.findOne({
        userId: payment.userId,
        courseId: payment.courseId,
      }).session(session)
      if (!enrollment) {
        const courseExists = await Course.exists({ _id: payment.courseId }).session(session)
        if (!courseExists) {
          const error = new Error('Le cours associé à cette commande n’existe plus.')
          error.status = 409
          throw error
        }
        ;[enrollment] = await Enrollment.create([{
          userId: payment.userId,
          courseId: payment.courseId,
          paymentId: confirmedPayment._id,
          enrolledAt: new Date(),
        }], { session })
        await Course.updateOne(
          { _id: payment.courseId },
          { $inc: { enrollmentCount: 1 } },
          { session },
        )
      }
    })
    return response.json({
      status: 'enrolled',
      message: 'Paiement confirmé : votre inscription au cours est active.',
      enrollment: { id: String(enrollment._id), courseId: String(enrollment.courseId) },
    })
  } catch (error) {
    if (error.code === 11000) {
      try {
        const payment = await Payment.findOne({ razorpayOrderId: request.body?.razorpay_order_id })
        const enrollment = payment && await Enrollment.findOne({
          userId: payment.userId,
          courseId: payment.courseId,
        })
        if (enrollment) {
          return response.json({
            status: 'enrolled',
            message: 'Paiement confirmé : votre inscription au cours est active.',
            enrollment: { id: String(enrollment._id), courseId: String(enrollment.courseId) },
          })
        }
      } catch (recoveryError) {
        return next(recoveryError)
      }
    }
    return next(error)
  } finally {
    await session.endSession()
  }
}

export async function listMyEnrollments(request, response, next) {
  try {
    const enrollments = await Enrollment.find({ userId: request.user._id })
      .populate({
        path: 'courseId',
        select: 'title category level image price currency status modules._id modules.title modules.lessons._id modules.lessons.title modules.lessons.durationMinutes',
      })
      .sort({ enrolledAt: -1 })
      .lean()
    return response.json({
      enrollments: enrollments
        .filter((enrollment) => enrollment.courseId)
        .map((enrollment) => ({
          id: String(enrollment._id),
          enrolledAt: enrollment.enrolledAt,
          course: {
            id: String(enrollment.courseId._id),
            title: enrollment.courseId.title,
            category: enrollment.courseId.category,
            level: enrollment.courseId.level,
            image: enrollment.courseId.image,
            price: enrollment.courseId.price,
            currency: enrollment.courseId.currency,
            status: enrollment.courseId.status,
            modules: enrollment.courseId.modules.map((module) => ({
              id: String(module._id),
              title: module.title,
              lessons: module.lessons.map((lesson) => ({
                id: String(lesson._id),
                title: lesson.title,
                durationMinutes: lesson.durationMinutes,
              })),
            })),
          },
        })),
    })
  } catch (error) {
    return next(error)
  }
}
