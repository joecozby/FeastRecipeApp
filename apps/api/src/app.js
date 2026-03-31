// Express app setup — routes will be mounted as modules are built
import express from 'express'
import cors from 'cors'

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

export default app
