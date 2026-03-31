import 'dotenv/config'
import app from './app.js'
import logger from './config/logger.js'
import './config/db.js'    // initialise pool + log connectivity on startup
import './config/redis.js' // initialise redis client

import { startImportWorker } from './workers/importWorker.js'
import { startMediaWorker } from './workers/mediaWorker.js'
import { startNutritionWorker } from './workers/nutritionWorker.js'

const PORT = process.env.PORT || 3000

// Start HTTP server
app.listen(PORT, () => {
  logger.info(`feast-api listening on port ${PORT}`, { env: process.env.NODE_ENV })
})

// Start background workers
startImportWorker()
startMediaWorker()
startNutritionWorker()
