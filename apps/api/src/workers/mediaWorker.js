import logger from '../config/logger.js'

/**
 * Media worker — stub for MVP.
 * In production this would:
 *  - Receive upload-complete events from S3
 *  - Generate thumbnails via sharp/ffmpeg
 *  - Update media_assets with final dimensions/duration
 *  - Purge CloudFront cache if needed
 */
export function startMediaWorker() {
  logger.info('Media worker: stub mode — no-op')
  return null
}
