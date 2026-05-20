import { describe, expect, it } from 'vitest';
import { type PostgresQueryClient as AssetQueryClient, PostgresAssetRepository } from '../src/db/postgresAssets.js';
import {
  type PostgresQueryClient as JobQueryClient,
  PostgresAiGenerationJobRepository,
} from '../src/db/postgresJobs.js';
import type { AiGenerationJobRow, AssetRow, JsonObject } from '../src/db/types.js';

interface RecordedQuery {
  sql: string;
  params: readonly unknown[];
}

class FakeQueryClient implements AssetQueryClient, JobQueryClient {
  readonly queries: RecordedQuery[] = [];
  private readonly rows: unknown[][];

  constructor(rows: unknown[][]) {
    this.rows = rows;
  }

  async query<TRow>(sql: string, params: readonly unknown[] = []): Promise<{ rows: TRow[] }> {
    this.queries.push({ sql, params });
    return { rows: (this.rows.shift() ?? []) as TRow[] };
  }
}

describe('PostgresAiGenerationJobRepository', () => {
  it('creates queued jobs with JSON settings and nullable fields', async () => {
    const row = createJobRow({ id: 'job-1', user_id: 'user-1' });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAiGenerationJobRepository(client);
    const settingsJson: JsonObject = { aspect: '1:1', quality: 'draft' };

    await expect(
      repo.create({
        id: 'job-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'image-model',
        prompt: 'cover art',
        settingsJson,
        idempotencyKey: 'idem-1',
      }),
    ).resolves.toBe(row);

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('INSERT INTO ai_generation_jobs');
    expect(client.queries[0]?.params).toEqual([
      'job-1',
      'user-1',
      'openai',
      'image-model',
      'cover art',
      null,
      settingsJson,
      'idem-1',
      null,
    ]);
  });

  it('counts active queued and running jobs for route quota checks', async () => {
    const client = new FakeQueryClient([[{ count: '2' }]]);
    const repo = new PostgresAiGenerationJobRepository(client);

    await expect(repo.countActiveJobs('user-1')).resolves.toBe(2);

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain("status IN ('queued', 'running')");
    expect(client.queries[0]?.params).toEqual(['user-1']);
  });

  it('throws when a job update misses', async () => {
    const client = new FakeQueryClient([[]]);
    const repo = new PostgresAiGenerationJobRepository(client);

    await expect(repo.markRunning('missing-job', new Date('2026-05-20T10:00:00.000Z'))).rejects.toThrow(
      'Generation job not found: missing-job',
    );
  });

  it('marks generation jobs as cancelled', async () => {
    const row = createJobRow({ status: 'cancelled' });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAiGenerationJobRepository(client);
    const cancelledAt = new Date('2026-05-20T10:03:00.000Z');

    await expect(repo.markCancelled('job-1', cancelledAt)).resolves.toBe(row);
    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain("SET status = 'cancelled'");
    expect(client.queries[0]?.params).toEqual(['job-1', cancelledAt]);
  });
});

describe('PostgresAssetRepository', () => {
  it('creates assets with storage and metadata fields', async () => {
    const row = createAssetRow({ id: 'asset-1', user_id: 'user-1' });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAssetRepository(client);
    const metadataJson: JsonObject = { provider: 'openai' };

    await expect(
      repo.create({
        id: 'asset-1',
        userId: 'user-1',
        kind: 'generated-image',
        storageKey: 'generated/asset-1.png',
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        sizeBytes: 2048,
        metadataJson,
      }),
    ).resolves.toBe(row);

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('INSERT INTO assets');
    expect(client.queries[0]?.params).toEqual([
      'asset-1',
      'user-1',
      'generated-image',
      'generated/asset-1.png',
      null,
      'image/png',
      1024,
      1024,
      2048,
      metadataJson,
    ]);
  });

  it('soft deletes assets by id and user', async () => {
    const deletedAt = new Date('2026-05-20T10:00:00.000Z');
    const row = createAssetRow({ id: 'asset-1', user_id: 'user-1', deleted_at: deletedAt });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAssetRepository(client);

    await expect(repo.softDelete('asset-1', 'user-1', deletedAt)).resolves.toBe(row);

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('SET deleted_at = $3');
    expect(client.queries[0]?.params).toEqual(['asset-1', 'user-1', deletedAt]);
  });
});

function createJobRow(overrides: Partial<AiGenerationJobRow>): AiGenerationJobRow {
  const now = new Date('2026-05-20T10:00:00.000Z');
  return {
    id: 'job',
    user_id: 'user',
    provider: 'openai',
    model: 'image-model',
    prompt: 'cover art',
    negative_prompt: null,
    settings_json: {},
    idempotency_key: 'idem',
    status: 'queued',
    output_asset_id: null,
    error_code: null,
    error_message: null,
    retryable: null,
    attempt_count: 0,
    estimated_cost: null,
    provider_usage_json: null,
    created_at: now,
    queued_at: now,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    expires_at: null,
    ...overrides,
  };
}

function createAssetRow(overrides: Partial<AssetRow>): AssetRow {
  return {
    id: 'asset',
    user_id: 'user',
    kind: 'generated-image',
    storage_key: 'generated/asset.png',
    public_uri: null,
    mime_type: 'image/png',
    width: 1024,
    height: 1024,
    size_bytes: 2048,
    metadata_json: {},
    created_at: new Date('2026-05-20T10:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}
