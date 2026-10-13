import 'dotenv/config'
import mongoose from 'mongoose'
import Course from '../src/models/Course.js'
import Enrollment from '../src/models/Enrollment.js'
import User from '../src/models/User.js'
import { connectMongoDB } from '../src/utils/connectMongoDB.js'

const [action, emailArgument, courseId] = process.argv.slice(2)
const email = emailArgument?.trim().toLowerCase()

function usage() {
  console.error('Usage : npm run enrollment:test -- <add|remove> adresse@example.com <courseId>')
  process.exitCode = 1
}

if (process.env.NODE_ENV !== 'development') {
  console.error('Cette commande est réservée à NODE_ENV=development ; aucune modification effectuée.')
  process.exitCode = 1
} else if (
  !['add', 'remove'].includes(action)
  || !email
  || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  || !mongoose.isValidObjectId(courseId)
) {
  usage()
} else if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI est nécessaire pour gérer une inscription de développement.')
  process.exitCode = 1
} else {
  let session
  try {
    await connectMongoDB(process.env.MONGODB_URI)
    session = await mongoose.startSession()
    await session.withTransaction(async () => {
      const user = await User.findOne({ email, emailVerified: true }).session(session)
      if (!user) {
        throw new Error('Aucun compte existant avec cette adresse e-mail vérifiée.')
      }
      const course = await Course.findOne({
        _id: courseId,
        status: { $in: ['published', 'archived'] },
      }).session(session)
      if (!course) {
        throw new Error('Cours introuvable ou non publié.')
      }

      const enrollment = await Enrollment.findOne({
        userId: user._id,
        courseId: course._id,
      }).session(session)
      if (action === 'add') {
        if (enrollment) {
          if (enrollment.source === 'development-test') {
            console.log('Cette inscription de développement existe déjà ; aucun changement effectué.')
            return
          }
          console.log('Ce compte est déjà inscrit via une autre source ; aucun changement effectué.')
          return
        }
        await Enrollment.create([{
          userId: user._id,
          courseId: course._id,
          source: 'development-test',
        }], { session })
        await Course.updateOne(
          { _id: course._id },
          { $inc: { enrollmentCount: 1 } },
          { session },
        )
        console.log('Inscription de développement créée (non payée, aucun document Payment créé).')
        return
      }

      if (!enrollment || enrollment.source !== 'development-test') {
        console.log('Aucune inscription de développement à retirer ; les inscriptions payées sont conservées.')
        return
      }
      await Enrollment.deleteOne({ _id: enrollment._id }, { session })
      await Course.updateOne(
        { _id: course._id },
        { $inc: { enrollmentCount: -1 } },
        { session },
      )
      console.log('Inscription de développement retirée ; les inscriptions payées ne sont jamais supprimées.')
    })
  } catch (error) {
    console.error('Échec de la commande d’inscription de développement :', error.message)
    process.exitCode = 1
  } finally {
    if (session) await session.endSession()
    await mongoose.disconnect()
  }
}
