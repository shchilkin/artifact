import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadConfig } from './config.js';
import { loadApiEnv } from './env.js';

type HealthcheckMode = 'api' | 'bull-board' | 'worker';

const mode = parseMode(process.argv[2]);

runHealthcheck(mode).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`healthcheck failed: ${message}`);
  process.exit(1);
});

async function runHealthcheck(healthcheckMode: HealthcheckMode) {
  if (healthcheckMode === 'worker') {
    await checkRuntimeDependencies({ assetStorage: true, database: true, redis: true });
    return;
  }

  await checkHttpHealth({ requireBullBoard: healthcheckMode === 'bull-board' });
  await checkRuntimeDependencies({
    assetStorage: healthcheckMode === 'api',
    database: healthcheckMode === 'api',
    redis: true,
  });
}

function parseMode(value: string | undefined): HealthcheckMode {
  if (value === 'api' || value === 'bull-board' || value === 'worker') return value;
  throw new Error('Usage: node dist/healthcheck.js api|bull-board|worker');
}

async function checkHttpHealth({ requireBullBoard }: { requireBullBoard: boolean }) {
  const port = process.env.PORT || '4000';
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  if (!response.ok) throw new Error(`/api/health returned ${response.status}`);

  if (!requireBullBoard) return;

  const body = (await response.json().catch(() => null)) as { bullBoardEnabled?: boolean } | null;
  if (!body?.bullBoardEnabled) throw new Error('Bull Board health endpoint is not running in board mode');
}

async function checkRuntimeDependencies(checks: { assetStorage: boolean; database: boolean; redis: boolean }) {
  loadApiEnv();
  const config = loadConfig();

  await Promise.all([
    checks.database ? checkDatabase(config) : undefined,
    checks.redis ? checkRedis(config) : undefined,
    checks.assetStorage ? checkAssetStorage(config) : undefined,
  ]);
}

async function checkDatabase(config: ReturnType<typeof loadConfig>) {
  if (config.databaseDriver !== 'postgres') return;
  const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 2_000 });
  try {
    await pool.query('select 1');
  } finally {
    await pool.end();
  }
}

async function checkRedis(config: ReturnType<typeof loadConfig>) {
  if (config.queueDriver !== 'bullmq') return;
  const redis = new Redis(config.redisUrl, {
    commandTimeout: 2_000,
    connectTimeout: 2_000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error(`Redis ping returned ${pong}`);
    const key = `artifact:healthcheck:${process.pid}`;
    await redis.set(key, '1', 'EX', 10);
    await redis.del(key);
  } finally {
    redis.disconnect();
  }
}

async function checkAssetStorage(config: ReturnType<typeof loadConfig>) {
  if (config.assetStorageDriver !== 'local') return;
  await access(config.assetStorageDir, constants.W_OK);
}
