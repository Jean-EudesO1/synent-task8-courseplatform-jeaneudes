import 'dotenv/config'
import mongoose from 'mongoose'
import { retryFailedEmailNotifications } from '../src/services/emailNotificationService.js'
import { connectMongoDB } from '../src/utils/connectMongoDB.js'

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI doit être configurée pour relancer les notifications.')
  process.exitCode = 1
} else {
  try {
    await connectMongoDB(process.env.MONGODB_URI)
    const result = await retryFailedEmailNotifications()
    console.log(`Notifications traitées : ${result.attempted}; envoyées : ${result.sent}.`)
    if (result.sent < result.attempted) {
      console.error('Certaines notifications restent en échec et pourront être relancées.')
      process.exitCode = 1
    }
  } catch (error) {
    console.error('La relance des notifications e-mail a échoué.', error.name || 'ERROR')
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}
