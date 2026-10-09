import 'dotenv/config'
import mongoose from 'mongoose'
import app from './app.js'
import { assertAuthConfiguration } from './utils/auth.js'

const port = Number(process.env.PORT) || 5000

assertAuthConfiguration()

if (process.env.MONGODB_URI) {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connexion MongoDB établie.')
  } catch (error) {
    console.error('Échec de la connexion MongoDB :', error.message)
    process.exitCode = 1
    throw error
  }
} else {
  console.warn('MONGODB_URI est absent : MongoDB n’a pas été connecté.')
}

app.listen(port, () => {
  console.log(`API disponible sur http://localhost:${port}`)
})
