import { Router } from 'express'
import { body } from 'express-validator'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'
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
    body('username')
      .trim().notEmpty().withMessage('Username is required')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores')
      .isLength({ min: 3, max: 20 }).withMessage('Username must be 3–20 characters'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { email, password, display_name, username } = req.body
    const usernameLower = username.toLowerCase()

    const { rows: existingEmail } = await pool.query(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [email]
    )
    if (existingEmail.length) throw new AppError('Email already registered', 409)

    const { rows: existingUsername } = await pool.query(
      'SELECT id FROM users WHERE lower(username) = $1',
      [usernameLower]
    )
    if (existingUsername.length) throw new AppError('Username already taken', 409)

    const password_hash = await bcrypt.hash(password, 12)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, role`,
        [email, password_hash, usernameLower]
      )
      await client.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [user.id, display_name]
      )
      await client.query(
        `INSERT INTO grocery_lists (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [user.id]
      )
      await client.query('COMMIT')

      const token = signToken(user.id, user.role)
      res.status(201).json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
)

// POST /api/auth/login
// Accepts email or username in the `login` field
router.post(
  '/login',
  [
    body('login').trim().notEmpty().withMessage('Email or username is required'),
    body('password').notEmpty(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { login, password } = req.body

    const { rows: [user] } = await pool.query(
      `SELECT id, email, username, password_hash, role FROM users
       WHERE (lower(email) = lower($1) OR lower(username) = lower($1))
         AND deleted_at IS NULL
       LIMIT 1`,
      [login]
    )
    if (!user) throw new AppError('Invalid credentials', 401)

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) throw new AppError('Invalid credentials', 401)

    const token = signToken(user.id, user.role)
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } })
  })
)

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.email, u.username, u.role, u.created_at,
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
    body('username')
      .optional({ nullable: true })
      .trim()
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores')
      .isLength({ min: 3, max: 20 }).withMessage('Username must be 3–20 characters'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { display_name, bio, username } = req.body

    // Update username on the users table (separate from profiles)
    if (username !== undefined && username !== null) {
      const usernameLower = username.toLowerCase()
      const { rows: existing } = await pool.query(
        'SELECT id FROM users WHERE lower(username) = $1 AND id != $2',
        [usernameLower, req.user.sub]
      )
      if (existing.length) throw new AppError('Username already taken', 409)
      await pool.query(
        'UPDATE users SET username = $1 WHERE id = $2',
        [usernameLower, req.user.sub]
      )
    }

    // Update profile fields
    const updates = []
    const params = []
    if (display_name !== undefined) { params.push(display_name); updates.push(`display_name = $${params.length}`) }
    if (bio !== undefined)          { params.push(bio);           updates.push(`bio = $${params.length}`) }
    if (updates.length) {
      params.push(req.user.sub)
      await pool.query(
        `UPDATE profiles SET ${updates.join(', ')}, updated_at = now() WHERE user_id = $${params.length}`,
        params
      )
    }

    if (!updates.length && username === undefined) throw new AppError('No valid fields to update', 400)

    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.email, u.username, u.role, u.created_at,
              p.display_name, p.bio, p.avatar_url
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.sub]
    )
    res.json(user)
  })
)

// POST /api/auth/avatar
// Accepts a base64 data URL, uploads to Cloudinary, updates profiles.avatar_url
router.post(
  '/avatar',
  requireAuth,
  [
    body('data_url').notEmpty().withMessage('data_url is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    if (!process.env.CLOUDINARY_URL) throw new AppError('Image uploads not configured', 503)

    const { data_url } = req.body
    const match = data_url.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s)
    if (!match) throw new AppError('Invalid image data', 400)

    const [, , base64] = match
    const buffer = Buffer.from(base64, 'base64')

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'feast/avatar',
          public_id: `user_${req.user.sub}`,
          overwrite: true,
          transformation: [
            { width: 256, height: 256, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (err, r) => (err ? reject(err) : resolve(r))
      )
      Readable.from(buffer).pipe(stream)
    })

    await pool.query(
      `UPDATE profiles SET avatar_url = $1, updated_at = now() WHERE user_id = $2`,
      [result.secure_url, req.user.sub]
    )

    res.json({ avatar_url: result.secure_url })
  })
)

export default router
