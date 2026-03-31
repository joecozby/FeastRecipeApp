import { Redis } from 'ioredis'
import logger from './logger.js'

function createRedisClient(name = 'redis') {
  const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  })

  client.on('connect', () => logger.info(`${name} connected`))
  client.on('error', (err) => logger.warn(`${name} error — ${err.message}`))

  return client
}

// Default client for general use
export const redis = createRedisClient('redis')

// BullMQ requires separate connection instances per queue/worker
export function newRedisConnection() {
  return createRedisClient('redis-bullmq')
}

export default redis
