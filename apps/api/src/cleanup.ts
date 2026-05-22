import type { AssetStorage } from './storage/index.js';

export interface CleanupQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export interface AiCleanupOptions {
  now?: Date;
  dryRun?: boolean;
  limit?: number;
  staleActiveJobMs?: number;
  orphanAssetMs?: number;
  deletedAssetFileMs?: number;
  assetStorage?: Pick<AssetStorage, 'deleteImage'>;
  listLocalStorageKeys?: () => Promise<string[]>;
}

export interface AiCleanupSummary {
  dryRun: boolean;
  expiredJobIds: string[];
  softDeletedAssetIds: string[];
  storageKeysDeleted: string[];
  orphanStorageKeysDeleted: string[];
}

interface IdRow {
  id: string;
}

interface AssetCleanupRow {
  id: string;
  storage_key: string;
}

interface StorageKeyRow {
  storage_key: string;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_STALE_ACTIVE_JOB_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ORPHAN_ASSET_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DELETED_ASSET_FILE_MS = 7 * 24 * 60 * 60 * 1000;

export async function cleanupAiGenerationData(
  client: CleanupQueryClient,
  options: AiCleanupOptions = {},
): Promise<AiCleanupSummary> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? true;
  const limit = normalizeLimit(options.limit ?? DEFAULT_LIMIT);
  const staleActiveJobCutoff = new Date(now.getTime() - (options.staleActiveJobMs ?? DEFAULT_STALE_ACTIVE_JOB_MS));
  const orphanAssetCutoff = new Date(now.getTime() - (options.orphanAssetMs ?? DEFAULT_ORPHAN_ASSET_MS));
  const deletedAssetFileCutoff = new Date(
    now.getTime() - (options.deletedAssetFileMs ?? DEFAULT_DELETED_ASSET_FILE_MS),
  );

  const expiredJobIds = dryRun
    ? await selectStaleActiveJobIds(client, staleActiveJobCutoff, limit)
    : await expireStaleActiveJobs(client, staleActiveJobCutoff, now, limit);

  const softDeletedAssets = dryRun
    ? await selectOrphanGeneratedAssets(client, orphanAssetCutoff, limit)
    : await softDeleteOrphanGeneratedAssets(client, orphanAssetCutoff, now, limit);

  const deletedAssetFiles = await selectDeletedGeneratedAssetFiles(client, deletedAssetFileCutoff, limit);
  const storageKeysDeleted: string[] = [];
  if (!dryRun && options.assetStorage) {
    for (const asset of [...softDeletedAssets, ...deletedAssetFiles]) {
      await options.assetStorage.deleteImage(asset.storage_key);
      storageKeysDeleted.push(asset.storage_key);
    }
  }

  const orphanStorageKeysDeleted = await cleanupOrphanLocalStorageKeys(client, {
    dryRun,
    limit,
    assetStorage: options.assetStorage,
    listLocalStorageKeys: options.listLocalStorageKeys,
  });

  return {
    dryRun,
    expiredJobIds,
    softDeletedAssetIds: softDeletedAssets.map((asset) => asset.id),
    storageKeysDeleted,
    orphanStorageKeysDeleted,
  };
}

async function selectStaleActiveJobIds(client: CleanupQueryClient, cutoff: Date, limit: number) {
  const result = await client.query<IdRow>(
    `
      SELECT id
      FROM ai_generation_jobs
      WHERE status IN ('queued', 'running')
        AND queued_at < $1
      ORDER BY queued_at ASC
      LIMIT $2
    `,
    [cutoff, limit],
  );
  return result.rows.map((row) => row.id);
}

async function expireStaleActiveJobs(client: CleanupQueryClient, cutoff: Date, now: Date, limit: number) {
  const result = await client.query<IdRow>(
    `
      UPDATE ai_generation_jobs
      SET status = 'expired',
          error_code = COALESCE(error_code, 'job_expired'),
          error_message = COALESCE(error_message, 'Generation job expired during cleanup.'),
          retryable = false,
          completed_at = $2
      WHERE id IN (
        SELECT id
        FROM ai_generation_jobs
        WHERE status IN ('queued', 'running')
          AND queued_at < $1
        ORDER BY queued_at ASC
        LIMIT $3
      )
      RETURNING id
    `,
    [cutoff, now, limit],
  );
  return result.rows.map((row) => row.id);
}

async function selectOrphanGeneratedAssets(client: CleanupQueryClient, cutoff: Date, limit: number) {
  const result = await client.query<AssetCleanupRow>(
    `
      SELECT id, storage_key
      FROM assets
      WHERE kind = 'generated-image'
        AND deleted_at IS NULL
        AND created_at < $1
        AND NOT EXISTS (
          SELECT 1
          FROM ai_generation_jobs
          WHERE ai_generation_jobs.output_asset_id = assets.id
        )
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [cutoff, limit],
  );
  return result.rows;
}

async function softDeleteOrphanGeneratedAssets(client: CleanupQueryClient, cutoff: Date, now: Date, limit: number) {
  const result = await client.query<AssetCleanupRow>(
    `
      UPDATE assets
      SET deleted_at = $2
      WHERE id IN (
        SELECT id
        FROM assets
        WHERE kind = 'generated-image'
          AND deleted_at IS NULL
          AND created_at < $1
          AND NOT EXISTS (
            SELECT 1
            FROM ai_generation_jobs
            WHERE ai_generation_jobs.output_asset_id = assets.id
          )
        ORDER BY created_at ASC
        LIMIT $3
      )
      RETURNING id, storage_key
    `,
    [cutoff, now, limit],
  );
  return result.rows;
}

async function selectDeletedGeneratedAssetFiles(client: CleanupQueryClient, cutoff: Date, limit: number) {
  const result = await client.query<AssetCleanupRow>(
    `
      SELECT id, storage_key
      FROM assets
      WHERE kind = 'generated-image'
        AND deleted_at IS NOT NULL
        AND deleted_at < $1
      ORDER BY deleted_at ASC
      LIMIT $2
    `,
    [cutoff, limit],
  );
  return result.rows;
}

async function cleanupOrphanLocalStorageKeys(
  client: CleanupQueryClient,
  options: {
    dryRun: boolean;
    limit: number;
    assetStorage?: Pick<AssetStorage, 'deleteImage'>;
    listLocalStorageKeys?: () => Promise<string[]>;
  },
) {
  if (!options.listLocalStorageKeys) return [];

  const localKeys = (await options.listLocalStorageKeys()).slice(0, options.limit);
  if (!localKeys.length) return [];

  const knownResult = await client.query<StorageKeyRow>(
    `
      SELECT storage_key
      FROM assets
      WHERE storage_key = ANY($1::text[])
    `,
    [localKeys],
  );
  const knownKeys = new Set(knownResult.rows.map((row) => row.storage_key));
  const orphanKeys = localKeys.filter((key) => !knownKeys.has(key));

  if (!options.dryRun && options.assetStorage) {
    for (const key of orphanKeys) {
      await options.assetStorage.deleteImage(key);
    }
  }

  return orphanKeys;
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('Cleanup limit must be a positive number.');
  }
  return Math.floor(limit);
}
