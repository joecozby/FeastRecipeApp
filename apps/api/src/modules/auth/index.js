import { Router } from 'express'
import { body } from 'express-validator'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'

const router = Router()

function signToken(userId, role) {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: '30d' })
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('display_name').trim().notEmpty().withMessage('display_name is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { email, password, display_name } = req.body

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [email]
    )
    if (existing.length) throw new AppError('Email already registered', 409)

    const password_hash = await bcrypt.hash(password, 12)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role`,
        [email, password_hash]
      )
      await client.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [user.id, display_name]
      )
      // Auto-create grocery list
      await client.query(
        `INSERT INTO grocery_lists (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [user.id]
      )
      await client.query('COMMIT')

      const token = signToken(user.id, user.role)
      res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
)

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { email, password } = req.body

    const { rows: [user] } = await pool.query(
      `SELECT id, email, password_hash, role FROM users
       WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email]
    )
    if (!user) throw new AppError('Invalid email or password', 401)

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) throw new AppError('Invalid email or password', 401)

    const token = signToken(user.id, user.role)
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } })
  })
)

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.display_name, p.bio, p.avatar_url
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [req.user.sub]
    )
    if (!user) throw new AppError('User not found', 404)
    res.json(user)
  })
)

// PATCH /api/auth/profile
router.patch(
  '/profile',
  requireAuth,
  [
    body('display_name').optional({ nullable: true }).trim().notEmpty().withMessage('display_name cannot be blank'),
    body('bio').optional({ nullable: true }).isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { display_name, bio } = req.body
    const updates = []
    const params = []
    if (display_name !== undefined) { params.push(display_name); updates.push(`display_name = $${params.length}`) }
    if (bio !== undefined)          { params.push(bio);           updates.push(`bio = $${params.length}`) }
    if (!updates.length) throw new AppError('No valid fields to update', 400)
    params.push(req.user.sub)
    await pool.query(
      `UPDATE profiles SET ${updates.join(', ')}, updated_at = now() WHERE user_id = $${params.length}`,
      params
    )
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.display_name, p.bio, p.avatar_url
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.sub]
    )
    res.json(user)
  })
)

export default router
