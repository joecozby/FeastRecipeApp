import { validationResult } from 'express-validator'

/**
 * Run after express-validator chains.
 * Collects errors and passes a typed validation error to next().
 *
 * Usage:
 *   router.post('/path', [body('email').isEmail(), validate], handler)
 */
export function validate(req, _res, next) {
  const result = validationResult(req)
  if (result.isEmpty()) return next()

  const details = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }))

  const err = new Error('Validation failed')
  err.type = 'validation'
  err.details = details
  next(err)
}
