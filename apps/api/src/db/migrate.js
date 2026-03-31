import 'dotenv/config'
import pg from 'pg'
import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Ensure migrations tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          SERIAL PRIMARY KEY,
        filename    TEXT UNIQUE NOT NULL,
        applied_at  TIMESTAMPTZ DEFAULT now()
      )
    `)

    // Get already-applied migrations
    const { rows: applied } = await pool.query(
      'SELECT filename FROM _migrations ORDER BY filename'
    )
    const appliedSet = new Set(applied.map((r) => r.filename))

    // Read all .sql files in order
    const migrationsDir = join(__dirname, 'migrations')
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    let ran = 0
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  skip  ${file}`)
        continue
      }

      const sql = await readFile(join(migrationsDir, file), 'utf-8')

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`  apply ${file}`)
        ran++
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${err.message}`)
      } finally {
        client.release()
      }
    }

    if (ran === 0) {
      console.log('No new migrations to apply.')
    } else {
      console.log(`\nApplied ${ran} migration(s).`)
    }
  } finally {
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
