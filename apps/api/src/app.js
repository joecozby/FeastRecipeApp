import express from 'express'
import cors from 'cors'
import logger from './config/logger.js'
import { errorHandler } from './middleware/errorHandler.js'

// Module routers
import authRouter from './modules/auth/index.js'
import recipesRouter from './modules/recipes/index.js'
import importRouter from './modules/import/index.js'
import cookbooksRouter from './modules/cookbooks/index.js'
import groceryRouter from './modules/grocery/index.js'
import searchRouter from './modules/search/index.js'
import tagsRouter from './modules/tags/index.js'
import mediaRouter from './modules/media/index.js'

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

// API routes
app.use('/api/auth', authRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api/import', importRouter)
app.use('/api/cookbooks', cookbooksRouter)
app.use('/api/grocery-lists', groceryRouter)
app.use('/api/search', searchRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/media', mediaRouter)

// 404 handler for unmatched API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler — must be last
app.use(errorHandler)

export default app
