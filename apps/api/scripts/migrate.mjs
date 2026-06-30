import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadEnvFiles } from './env-file.mjs';

loadEnvFiles([resolve(process.cwd(), '.env'), resolve(process.cwd(), '.env.local')]);

const connectAttempts = positiveIntegerEnv('DB_MIGRATION_CONNECT_ATTEMPTS', 20);
const connectDelayMs = positiveIntegerEnv('DB_MIGRATION_CONNECT_DELAY_MS', 3_000);
const migrationLockId = 74_291_001;
const migrationTable = 'schema_migrations';
const transientConnectionCodes = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  '57P03',
]);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const migrationsDir = resolve(process.cwd(), 'src/db/migrations');
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, max: 1 });
let client;

try {
  client = await connectWithRetry();
  await withMigrationLock(client, async () => {
    await ensureMigrationTable(client);
    for (const file of files) {
      await applyMigration(client, file);
    }
  });
} finally {
  client?.release();
  await pool.end();
}

async function applyMigration(client, file) {
  const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
  assertNoTransactionControl(sql, file);
  const checksum = sha256(sql);
  const existing = await findAppliedMigration(client, file);

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error(`Migration ${file} was already applied with a different checksum.`);
    }
    console.log(JSON.stringify({ migration: file, applied: false, reason: 'already_applied' }));
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`INSERT INTO ${migrationTable} (name, checksum) VALUES ($1, $2)`, [file, checksum]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  console.log(JSON.stringify({ migration: file, applied: true }));
}

async function connectWithRetry() {
  let lastError;

  for (let attempt = 1; attempt <= connectAttempts; attempt += 1) {
    let client;
    try {
      client = await pool.connect();
      await client.query('select 1');
      if (attempt > 1) console.log(JSON.stringify({ event: 'db_migration.connected', attempt }));
      return client;
    } catch (error) {
      client?.release();
      lastError = error;
      if (!shouldRetryConnection(error, attempt)) break;
      console.warn(
        JSON.stringify({
          event: 'db_migration.connect_retry',
          attempt,
          attempts: connectAttempts,
          delayMs: connectDelayMs,
          error: formatConnectionError(error),
        }),
      );
      await sleep(connectDelayMs);
    }
  }

  throw lastError;
}

async function withMigrationLock(client, callback) {
  await client.query('select pg_advisory_lock($1)', [migrationLockId]);
  try {
    await callback();
  } finally {
    await client.query('select pg_advisory_unlock($1)', [migrationLockId]);
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function findAppliedMigration(client, name) {
  const result = await client.query(`SELECT checksum FROM ${migrationTable} WHERE name = $1`, [name]);
  return result.rows[0] ?? null;
}

function assertNoTransactionControl(sql, file) {
  if (!/(^|\n)\s*(BEGIN|COMMIT|ROLLBACK)\s*;/iu.test(sql)) return;
  throw new Error(`Migration ${file} must not contain transaction control statements.`);
}

function shouldRetryConnection(error, attempt) {
  return transientConnectionCodes.has(error?.code) && attempt < connectAttempts;
}

function formatConnectionError(error) {
  return error?.code ?? error?.message ?? 'unknown';
}

function positiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
