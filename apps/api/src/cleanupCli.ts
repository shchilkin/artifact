import pg from 'pg';
import { cleanupAiGenerationData } from './cleanup.js';
import { loadApiEnv } from './env.js';
import { LocalAssetStorage } from './storage/index.js';

loadApiEnv();

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
