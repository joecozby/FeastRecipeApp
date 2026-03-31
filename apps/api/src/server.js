import 'dotenv/config'
import app from './app.js'
import logger from './config/logger.js'
import './config/db.js'   // initialise pool + log connectivity on startup
import './config/redis.js' // initialise redis client

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  logger.info(`feast-api listening on port ${PORT}`, { env: process.env.NODE_ENV })
})
