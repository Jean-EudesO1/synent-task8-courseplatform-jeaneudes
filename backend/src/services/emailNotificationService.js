import EmailNotification from '../models/EmailNotification.js'
import Course from '../models/Course.js'
import User from '../models/User.js'
import {
  sendCourseEnrollmentEmail,
  sendTestNotificationEmail,
} from './emailService.js'

const SENDING_STALE_AFTER_MS = 5 * 60 * 1000

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : error?.name
  return typeof code === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(code)
    ? code
    : 'DELIVERY_FAILED'
}

export async function deliverEmailNotification(notificationId) {
  try {
    const notification = await EmailNotification.findOneAndUpdate(
      { _id: notificationId, status: { $in: ['pending', 'failed'] } },
      {
        $set: { status: 'sending', lastErrorCode: null },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' },
    ).lean()
    if (!notification) return false

    try {
      if (notification.kind === 'test') {
        await sendTestNotificationEmail(notification.recipient)
      } else {
        const [user, course] = await Promise.all([
          User.findById(notification.userId).select('name email').lean(),
          Course.findById(notification.courseId).select('title').lean(),
        ])
        if (!user || !course || !notification.enrollmentId || !notification.paymentId) {
          const error = new Error('Notification dependencies are unavailable.')
          error.code = 'NOTIFICATION_DATA_MISSING'
          throw error
        }
        await sendCourseEnrollmentEmail(user, course)
      }
      await EmailNotification.updateOne(
        { _id: notification._id, status: 'sending' },
        { $set: { status: 'sent', sentAt: new Date(), lastErrorCode: null } },
      )
      return true
    } catch (error) {
      await EmailNotification.updateOne(
        { _id: notification._id, status: 'sending' },
        { $set: { status: 'failed', lastErrorCode: safeErrorCode(error) } },
      )
      console.error('Échec d’envoi d’une notification e-mail.', safeErrorCode(error))
      return false
    }
  } catch {
    console.error('Impossible de traiter une notification e-mail.')
    return false
  }
}

export async function retryFailedEmailNotifications({ limit = 100, notificationIds } = {}) {
  const staleBefore = new Date(Date.now() - SENDING_STALE_AFTER_MS)
  const scope = notificationIds ? { _id: { $in: notificationIds } } : {}
  await EmailNotification.updateMany(
    { ...scope, status: 'sending', updatedAt: { $lte: staleBefore } },
    { $set: { status: 'failed', lastErrorCode: 'DELIVERY_INTERRUPTED' } },
  )
  const filter = { ...scope, status: { $in: ['pending', 'failed'] } }
  const failed = await EmailNotification.find(filter)
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('_id')
    .lean()
  let sent = 0
  for (const notification of failed) {
    if (await deliverEmailNotification(notification._id)) sent += 1
  }
  return { attempted: failed.length, sent }
}
