import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'

const app = express()
const port = Number(process.env.PORT) || 5000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(cors({ origin: frontendUrl }))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  const databaseStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }

  response.json({
    status: 'ok',
    database: process.env.MONGODB_URI
      ? databaseStates[mongoose.connection.readyState] || 'unknown'
      : 'not_configured',
  })
})

app.listen(port, () => {
  console.log(`API disponible sur http://localhost:${port}`)

  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI est absent : MongoDB n’a pas été connecté.')
    return
  }

  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connexion MongoDB établie.'))
    .catch((error) => console.error('Échec de la connexion MongoDB :', error.message))
})
