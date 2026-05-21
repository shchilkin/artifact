import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const migrationsDir = resolve(process.cwd(), 'src/db/migrations');
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    await pool.query(sql);
    console.log(JSON.stringify({ migration: file, applied: true }));
  }
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
