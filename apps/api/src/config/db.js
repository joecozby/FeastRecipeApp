import pg from 'pg'
import logger from './logger.js'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error', { error: err.message })
})

// Verify connectivity on startup — logs a warning if DB isn't reachable yet
pool.connect((err, client, release) => {
  if (err) {
    logger.warn('DB not reachable at startup — will retry on first query', {
      error: err.message,
    })
    return
  }
  release()
  logger.info('DB pool connected')
})

export default pool
