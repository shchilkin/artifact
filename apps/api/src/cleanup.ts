import type { AssetStorage } from './storage/index.js';

export interface CleanupQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export interface AiCleanupOptions {
  now?: Date;
  dryRun?: boolean;
  limit?: number;
  staleActiveOperationMs?: number;
  staleActiveJobMs?: number;
  orphanAssetMs?: number;
  deletedAssetFileMs?: number;
  assetStorage?: Pick<AssetStorage, 'deleteImage'>;
  listLocalStorageKeys?: () => Promise<string[]>;
}

export interface AiCleanupSummary {
  dryRun: boolean;
  reconciledOperationIds: string[];
  expiredOperationIds: string[];
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
const DEFAULT_STALE_ACTIVE_OPERATION_MS = 6 * 60 * 60 * 1000;
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
  const staleActiveOperationCutoff = new Date(
    now.getTime() - (options.staleActiveOperationMs ?? DEFAULT_STALE_ACTIVE_OPERATION_MS),
  );
  const staleActiveJobCutoff = new Date(now.getTime() - (options.staleActiveJobMs ?? DEFAULT_STALE_ACTIVE_JOB_MS));
  const orphanAssetCutoff = new Date(now.getTime() - (options.orphanAssetMs ?? DEFAULT_ORPHAN_ASSET_MS));
  const deletedAssetFileCutoff = new Date(
    now.getTime() - (options.deletedAssetFileMs ?? DEFAULT_DELETED_ASSET_FILE_MS),
  );

  const reconciledOperationIds = dryRun
    ? await selectRecoverableOperationIds(client, limit)
    : await reconcileUsableOperations(client, now, limit);

  const expiredOperationIds = dryRun
    ? await selectStaleActiveOperationIds(client, staleActiveOperationCutoff, limit)
    : await expireStaleActiveOperations(client, staleActiveOperationCutoff, now, limit);

  const expiredJobIds = dryRun
    ? await selectStaleActiveJobIds(client, staleActiveJobCutoff, limit)
    : await expireStaleActiveJobs(client, staleActiveJobCutoff, now, limit);

  const softDeletedAssets = dryRun
    ? await selectOrphanAssets(client, orphanAssetCutoff, limit)
    : await softDeleteOrphanAssets(client, orphanAssetCutoff, now, limit);

  const deletedAssetFiles = await selectDeletedAssetFiles(client, deletedAssetFileCutoff, limit);
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
    reconciledOperationIds,
    expiredOperationIds,
    expiredJobIds,
    softDeletedAssetIds: softDeletedAssets.map((asset) => asset.id),
    storageKeysDeleted,
    orphanStorageKeysDeleted,
  };
}

async function selectRecoverableOperationIds(client: CleanupQueryClient, limit: number) {
  const result = await client.query<IdRow>(
    `
      SELECT operations.id
      FROM ai_operations AS operations
      WHERE operations.status IN ('reserved', 'running')
        AND (
          EXISTS (
            SELECT 1 FROM ai_generation_jobs AS jobs
            WHERE jobs.operation_id = operations.id AND jobs.status = 'succeeded'
          )
          OR EXISTS (
            SELECT 1 FROM ai_shader_requests AS shaders
            WHERE shaders.operation_id = operations.id AND shaders.status = 'accepted'
          )
        )
      ORDER BY operations.created_at ASC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows.map((row) => row.id);
}

async function reconcileUsableOperations(client: CleanupQueryClient, now: Date, limit: number) {
  const result = await client.query<IdRow>(
    `
      WITH transitioned AS (
        UPDATE ai_operations AS operations
        SET status = 'succeeded', completed_at = $1
        WHERE operations.id IN (
          SELECT candidates.id
          FROM ai_operations AS candidates
          WHERE candidates.status IN ('reserved', 'running')
            AND (
              EXISTS (
                SELECT 1 FROM ai_generation_jobs AS jobs
                WHERE jobs.operation_id = candidates.id AND jobs.status = 'succeeded'
              )
              OR EXISTS (
                SELECT 1 FROM ai_shader_requests AS shaders
                WHERE shaders.operation_id = candidates.id AND shaders.status = 'accepted'
              )
            )
          ORDER BY candidates.created_at ASC
          LIMIT $2
        )
          AND operations.status IN ('reserved', 'running')
        RETURNING operations.id, operations.user_id, operations.reservation_period, operations.reserved_generations
      ), usage_updated AS (
        UPDATE ai_usage_monthly AS usage
        SET committed_generation_count = usage.committed_generation_count + transitioned.reserved_generations,
            reserved_generation_count = GREATEST(
              0,
              usage.reserved_generation_count - transitioned.reserved_generations
            ),
            generation_count = usage.committed_generation_count
              + transitioned.reserved_generations
              + GREATEST(0, usage.reserved_generation_count - transitioned.reserved_generations),
            updated_at = $1
        FROM transitioned
        WHERE usage.user_id = transitioned.user_id
          AND usage.period = transitioned.reservation_period
        RETURNING usage.user_id
      )
      SELECT id FROM transitioned
    `,
    [now, limit],
  );
  return result.rows.map((row) => row.id);
}

async function selectStaleActiveOperationIds(client: CleanupQueryClient, cutoff: Date, limit: number) {
  const result = await client.query<IdRow>(
    `
      SELECT id
      FROM ai_operations
      WHERE status IN ('reserved', 'running')
        AND COALESCE(started_at, created_at) < $1
      ORDER BY COALESCE(started_at, created_at) ASC
      LIMIT $2
    `,
    [cutoff, limit],
  );
  return result.rows.map((row) => row.id);
}

async function expireStaleActiveOperations(client: CleanupQueryClient, cutoff: Date, now: Date, limit: number) {
  const result = await client.query<IdRow>(
    `
      WITH transitioned AS (
        UPDATE ai_operations
        SET status = 'expired',
            error_code = COALESCE(error_code, 'operation_expired'),
            completed_at = $2
        WHERE id IN (
          SELECT id
          FROM ai_operations
          WHERE status IN ('reserved', 'running')
            AND COALESCE(started_at, created_at) < $1
          ORDER BY COALESCE(started_at, created_at) ASC
          LIMIT $3
        )
          AND status IN ('reserved', 'running')
        RETURNING id, user_id, reservation_period, reserved_generations
      ), usage_updated AS (
        UPDATE ai_usage_monthly AS usage
        SET reserved_generation_count = GREATEST(
              0,
              usage.reserved_generation_count - transitioned.reserved_generations
            ),
            generation_count = usage.committed_generation_count
              + GREATEST(0, usage.reserved_generation_count - transitioned.reserved_generations),
            updated_at = $2
        FROM transitioned
        WHERE usage.user_id = transitioned.user_id
          AND usage.period = transitioned.reservation_period
        RETURNING usage.user_id
      ), jobs_expired AS (
        UPDATE ai_generation_jobs AS jobs
        SET status = 'expired',
            error_code = COALESCE(jobs.error_code, 'operation_expired'),
            error_message = COALESCE(jobs.error_message, 'Generation operation expired during cleanup.'),
            retryable = false,
            completed_at = $2
        FROM transitioned
        WHERE jobs.operation_id = transitioned.id
          AND jobs.status IN ('queued', 'running')
        RETURNING jobs.id
      ), shaders_failed AS (
        UPDATE ai_shader_requests AS shaders
        SET status = 'failed',
            error_status = 504,
            error_code = COALESCE(shaders.error_code, 'operation_expired'),
            error_message = COALESCE(shaders.error_message, 'Shader operation expired before completion.'),
            completed_at = $2
        FROM transitioned
        WHERE shaders.operation_id = transitioned.id
          AND shaders.status IN ('pending', 'generated', 'client_rejected', 'repairing')
        RETURNING shaders.id
      )
      SELECT id FROM transitioned
    `,
    [cutoff, now, limit],
  );
  return result.rows.map((row) => row.id);
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
        AND status IN ('queued', 'running')
      RETURNING id
    `,
    [cutoff, now, limit],
  );
  return result.rows.map((row) => row.id);
}

async function selectOrphanAssets(client: CleanupQueryClient, cutoff: Date, limit: number) {
  const result = await client.query<AssetCleanupRow>(
    `
      SELECT id, storage_key
      FROM assets
      WHERE (
        (
          kind = 'generated-image'
          AND NOT EXISTS (
            SELECT 1
            FROM ai_generation_jobs
            WHERE ai_generation_jobs.output_asset_id = assets.id
          )
        )
        OR (
          kind LIKE 'project-%'
          AND NOT EXISTS (
            SELECT 1
            FROM cloud_projects
            WHERE cloud_projects.user_id = assets.user_id
              AND cloud_projects.doc_json::text LIKE (
                '%artifact-cloud-asset://' || replace(assets.kind, 'project-', '') || '/' || assets.id || '%'
              )
          )
        )
      )
        AND deleted_at IS NULL
        AND created_at < $1
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [cutoff, limit],
  );
  return result.rows;
}

async function softDeleteOrphanAssets(client: CleanupQueryClient, cutoff: Date, now: Date, limit: number) {
  const result = await client.query<AssetCleanupRow>(
    `
      UPDATE assets
      SET deleted_at = $2
      WHERE id IN (
        SELECT id
        FROM assets
        WHERE (
          (
            kind = 'generated-image'
            AND NOT EXISTS (
              SELECT 1
              FROM ai_generation_jobs
              WHERE ai_generation_jobs.output_asset_id = assets.id
            )
          )
          OR (
            kind LIKE 'project-%'
            AND NOT EXISTS (
              SELECT 1
              FROM cloud_projects
              WHERE cloud_projects.user_id = assets.user_id
                AND cloud_projects.doc_json::text LIKE (
                  '%artifact-cloud-asset://' || replace(assets.kind, 'project-', '') || '/' || assets.id || '%'
                )
            )
          )
        )
          AND deleted_at IS NULL
          AND created_at < $1
        ORDER BY created_at ASC
        LIMIT $3
      )
      RETURNING id, storage_key
    `,
    [cutoff, now, limit],
  );
  return result.rows;
}

async function selectDeletedAssetFiles(client: CleanupQueryClient, cutoff: Date, limit: number) {
  const result = await client.query<AssetCleanupRow>(
    `
      SELECT id, storage_key
      FROM assets
      WHERE (kind = 'generated-image' OR kind LIKE 'project-%')
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
