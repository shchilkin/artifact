import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { cleanupAiGenerationData } from './cleanup.js';
import { LocalAssetStorage } from './storage/index.js';

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--apply');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const storageDir = process.env.ASSET_STORAGE_DIR ?? './storage';
const storage = new LocalAssetStorage(storageDir);
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const summary = await cleanupAiGenerationData(pool, {
    dryRun,
    assetStorage: storage,
    listLocalStorageKeys: () => storage.listGeneratedImageKeys(),
    limit: numberArg('--limit', 100),
    staleActiveJobMs: hoursArg('--stale-active-hours', 6),
    orphanAssetMs: hoursArg('--orphan-asset-hours', 24),
    deletedAssetFileMs: daysArg('--deleted-asset-file-days', 7),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) {
    console.log('Dry run only. Re-run with --apply to mutate database rows and delete local files.');
  }
} finally {
  await pool.end();
}

function numberArg(name: string, fallback: number) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  if (!arg) return fallback;
  const value = Number(arg.slice(prefix.length));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function hoursArg(name: string, fallbackHours: number) {
  return numberArg(name, fallbackHours) * 60 * 60 * 1000;
}

function daysArg(name: string, fallbackDays: number) {
  return numberArg(name, fallbackDays) * 24 * 60 * 60 * 1000;
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry || process.env[entry.key] !== undefined) continue;
    process.env[entry.key] = entry.value;
  }
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;
  const key = trimmed.slice(0, separator).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) return null;
  return { key, value: stripQuotes(trimmed.slice(separator + 1).trim()) };
}

function stripQuotes(value: string) {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value;
  return value.slice(1, -1);
}
