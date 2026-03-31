import logger from '../config/logger.js'

/**
 * AppError — throw this anywhere in route handlers or services.
 * The global error handler will pick up statusCode and message.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message)
    this.statusCode = statusCode
    this.details = details
    this.isOperational = true
  }
}

/**
 * Global error handler — must be registered last in app.js.
 * Handles both AppError instances and unexpected errors.
 */
export function errorHandler(err, req, res, _next) {
  // Validation errors from express-validator arrive as arrays
  if (err.type === 'validation') {
    return res.status(422).json({ error: 'Validation failed', details: err.details })
  }

  const statusCode = err.statusCode ?? 500
  const message = err.isOperational ? err.message : 'Internal server error'

  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    })
  } else {
    logger.debug('Client error', {
      error: err.message,
      statusCode,
      path: req.path,
    })
  }

  res.status(statusCode).json({
    error: message,
    ...(err.details ? { details: err.details } : {}),
  })
}

/**
 * Wraps an async route handler so errors are forwarded to next().
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next)
}
