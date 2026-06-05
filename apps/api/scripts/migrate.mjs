import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadEnvFiles } from './env-file.mjs';

loadEnvFiles([resolve(process.cwd(), '.env'), resolve(process.cwd(), '.env.local')]);

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
