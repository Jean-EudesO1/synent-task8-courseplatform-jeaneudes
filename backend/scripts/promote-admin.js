import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const email = process.argv[2]?.trim().toLowerCase()

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage : npm run admin:promote -- adresse-utilisateur@example.com')
  process.exitCode = 1
} else if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI est nécessaire pour promouvoir un utilisateur existant.')
  process.exitCode = 1
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    const user = await User.findOne({ email }).select('role')
    if (!user) {
      console.error('Aucun utilisateur existant ne correspond à cette adresse.')
      process.exitCode = 1
    } else if (user.role === 'admin') {
      console.log('Ce compte possède déjà le rôle administrateur.')
    } else {
      const result = await User.updateOne(
        { _id: user._id, role: { $ne: 'admin' } },
        { $set: { role: 'admin' }, $inc: { tokenVersion: 1 } },
      )
      if (result.modifiedCount) {
        console.log('Le rôle administrateur a été attribué. Reconnectez-vous pour actualiser votre session.')
      } else {
        const currentUser = await User.findById(user._id).select('role')
        if (currentUser?.role === 'admin') {
          console.log('Ce compte possède déjà le rôle administrateur.')
        } else {
          throw new Error('Le rôle du compte n’a pas pu être modifié.')
        }
      }
    }
  } catch (error) {
    console.error('Échec de la promotion du compte :', error.code || error.name)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}
