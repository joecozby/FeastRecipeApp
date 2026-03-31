import jwt from 'jsonwebtoken'
import { AppError } from './errorHandler.js'

/**
 * Verifies the JWT from the Authorization header.
 * Sets req.user = { sub: userId, role } on success.
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Missing or invalid Authorization header', 401))
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { sub: payload.sub, role: payload.role }
    next()
  } catch {
    next(new AppError('Invalid or expired token', 401))
  }
}

/**
 * Optional auth — populates req.user if a valid token is present,
 * but does not reject requests without one.
 */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return next()

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { sub: payload.sub, role: payload.role }
  } catch {
    // silently ignore invalid tokens for optional routes
  }
  next()
}

/**
 * Role guard — must be used after requireAuth.
 * Usage: requireRole('admin') or requireRole(['admin','moderator'])
 */
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles]
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('Unauthorized', 401))
    if (!allowed.includes(req.user.role)) {
      return next(new AppError('Forbidden', 403))
    }
    next()
  }
}
