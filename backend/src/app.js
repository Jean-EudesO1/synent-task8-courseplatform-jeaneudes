import 'dotenv/config'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import mongoose from 'mongoose'
import authRoutes from './routes/authRoutes.js'
import adminCourseRoutes from './routes/adminCourseRoutes.js'
import adminManagementRoutes from './routes/adminManagementRoutes.js'
import courseRoutes from './routes/courseRoutes.js'
import paymentRoutes from './routes/paymentRoutes.js'
import { frontendUrl } from './config.js'

const app = express()

app.use(cors({ origin: frontendUrl, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

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

app.use('/api/auth', authRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/admin/courses', adminCourseRoutes)
app.use('/api/admin', adminManagementRoutes)
app.use('/api', paymentRoutes)

app.use((error, _request, response, _next) => {
  if (!error.status || error.status >= 500) {
    console.error('Erreur API :', error.message)
  }
  response.status(error.status || 500).json({
    message: error.status ? error.message : 'Une erreur interne est survenue.',
  })
})

export default app
