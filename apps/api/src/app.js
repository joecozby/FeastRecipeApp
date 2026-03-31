import express from 'express'
import cors from 'cors'
import logger from './config/logger.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

app.use(express.json())

// Request logger
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`)
  next()
})

// Health check — no auth required
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'feast-api' })
})

// --- Module routes mounted here as steps are completed ---

// Global error handler — must be last
app.use(errorHandler)

export default app
