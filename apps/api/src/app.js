// Express app setup — routes will be mounted as modules are built
import express from 'express'
import cors from 'cors'
import logger from './config/logger.js'

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'feast-api' })
})

// Minimal request logger — expanded middleware added in Step 5
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`)
  next()
})

export default app
