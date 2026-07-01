import { resolve } from 'node:path';
import pg from 'pg';
import { loadEnvFiles } from './env-file.mjs';

loadEnvFiles([resolve(process.cwd(), '.env'), resolve(process.cwd(), '.env.local')]);

const [userId, email] = process.argv.slice(2);
if (!userId) {
  console.error('Usage: npm --workspace @artifact/api run grant:ai -- <auth-user-id> [email]');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  await pool.query('BEGIN');
  const detachedEmailRows = email
    ? await pool.query(
        `
          UPDATE users
          SET email = NULL,
              updated_at = now()
          WHERE email = $2
            AND id <> $1
          RETURNING id
        `,
        [userId, email],
      )
    : { rows: [] };

  const result = await pool.query(
    `
      INSERT INTO users (id, email, role, ai_enabled, plus_status)
      VALUES ($1, $2, 'user', true, 'active')
      ON CONFLICT (id) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, users.email),
          ai_enabled = true,
          plus_status = 'active',
          disabled_at = NULL,
          updated_at = now()
      RETURNING id, email, role, ai_enabled, plus_status
    `,
    [userId, email ?? null],
  );
  await pool.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        user: result.rows[0],
        detachedEmailFromUserIds: detachedEmailRows.rows.map((row) => row.id),
      },
      null,
      2,
    ),
  );
} catch (error) {
  await pool.query('ROLLBACK');
  throw error;
} finally {
  await pool.end();
}
