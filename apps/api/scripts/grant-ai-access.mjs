import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

const [userId, email] = process.argv.slice(2);
if (!userId) {
  console.error('Usage: npm --prefix apps/api run grant:ai -- <clerk-user-id> [email]');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
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
  console.log(JSON.stringify({ user: result.rows[0] }, null, 2));
} finally {
  await pool.end();
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry || process.env[entry.key] !== undefined) continue;
    process.env[entry.key] = entry.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;
  const key = trimmed.slice(0, separator).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) return null;
  return { key, value: stripQuotes(trimmed.slice(separator + 1).trim()) };
}

function stripQuotes(value) {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value;
  return value.slice(1, -1);
}
