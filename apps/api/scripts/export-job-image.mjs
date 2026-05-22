import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import pg from 'pg';

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), 'apps/api/.env'));
loadEnvFile(resolve(process.cwd(), 'apps/api/.env.local'));

const [jobId, outputPathArg] = process.argv.slice(2);
if (!jobId) {
  console.error('Usage: npm --workspace @artifact/api run export:job-image -- <job-id> [output-path]');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

if ((process.env.ASSET_STORAGE_DRIVER ?? 'local') !== 'local') {
  console.error('Only local asset storage is supported by this recovery script.');
  process.exit(1);
}

const assetStorageDir = resolve(process.cwd(), process.env.ASSET_STORAGE_DIR ?? './storage');
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(
    `
      SELECT
        jobs.id AS job_id,
        jobs.user_id,
        jobs.status,
        jobs.output_asset_id,
        jobs.completed_at,
        assets.id AS asset_id,
        assets.storage_key,
        assets.mime_type,
        assets.width,
        assets.height,
        assets.size_bytes,
        assets.deleted_at
      FROM ai_generation_jobs jobs
      LEFT JOIN assets ON assets.id = jobs.output_asset_id
      WHERE jobs.id = $1
      LIMIT 1
    `,
    [jobId],
  );

  const row = result.rows[0];
  if (!row) fail(`Generation job not found: ${jobId}`);
  if (row.status !== 'succeeded') fail(`Generation job is ${row.status}, not succeeded.`);
  if (!row.output_asset_id) fail('Generation job has no output asset id.');
  if (!row.asset_id) fail(`Output asset row not found: ${row.output_asset_id}`);
  if (row.deleted_at) fail(`Output asset is deleted: ${row.asset_id}`);
  if (!row.storage_key) fail(`Output asset has no storage key: ${row.asset_id}`);

  const sourcePath = resolve(assetStorageDir, row.storage_key);
  if (!existsSync(sourcePath)) fail(`Asset file is missing: ${sourcePath}`);

  const outputPath = resolve(process.cwd(), outputPathArg ?? defaultOutputPath(row));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, readFileSync(sourcePath));

  console.log(
    JSON.stringify(
      {
        job: {
          id: row.job_id,
          userId: row.user_id,
          status: row.status,
          completedAt: row.completed_at,
        },
        asset: {
          id: row.asset_id,
          storageKey: row.storage_key,
          mimeType: row.mime_type,
          width: row.width,
          height: row.height,
          sizeBytes: row.size_bytes,
        },
        sourcePath,
        outputPath,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}

function defaultOutputPath(row) {
  const extension = extname(row.storage_key || '') || extensionForMime(row.mime_type);
  return `./recovered-images/${row.job_id}${extension}`;
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/svg+xml') return '.svg';
  return '.png';
}

function fail(message) {
  console.error(message);
  process.exit(1);
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
