import { describe, expect, it } from 'vitest';
import { ACTIVE_GENERATION_JOB_INDEX, ActiveGenerationJobExistsError } from '../src/db/errors.js';
import { type PostgresQueryClient as AssetQueryClient, PostgresAssetRepository } from '../src/db/postgresAssets.js';
import {
  type PostgresQueryClient as JobQueryClient,
  PostgresAiGenerationJobRepository,
} from '../src/db/postgresJobs.js';
import {
  PostgresAiShaderRequestRepository,
  type PostgresQueryClient as ShaderQueryClient,
} from '../src/db/postgresShaderRequests.js';
import { PostgresUsageRepository, type PostgresQueryClient as UsageQueryClient } from '../src/db/postgresUsage.js';
import type {
  AiGenerationJobRow,
  AiShaderRequestRow,
  AiUsageMonthlyRow,
  AssetRow,
  JsonObject,
} from '../src/db/types.js';

interface RecordedQuery {
  sql: string;
  params: readonly unknown[];
}

class FakeQueryClient implements AssetQueryClient, JobQueryClient, ShaderQueryClient, UsageQueryClient {
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

class ThrowingQueryClient implements JobQueryClient {
  async query<TRow>(): Promise<{ rows: TRow[] }> {
    throw Object.assign(new Error('duplicate active generation'), {
      code: '23505',
      constraint: ACTIVE_GENERATION_JOB_INDEX,
    });
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
      null,
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

  it('maps active-job unique violations to a domain error', async () => {
    const repo = new PostgresAiGenerationJobRepository(new ThrowingQueryClient());

    await expect(
      repo.create({
        id: 'job-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'image-model',
        prompt: 'cover art',
        settingsJson: {},
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toBeInstanceOf(ActiveGenerationJobExistsError);
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

describe('PostgresAiShaderRequestRepository', () => {
  it('claims a request without replacing an existing idempotency key', async () => {
    const row = createShaderRow();
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAiShaderRequestRepository(client);

    await expect(
      repo.claim({
        id: 'shader-request-1',
        userId: 'user-1',
        idempotencyKey: 'shader-idem-1',
        mode: 'openai',
        prompt: 'water glass',
      }),
    ).resolves.toMatchObject({ claimed: true, row: { id: 'shader-request-1', status: 'pending' } });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('ON CONFLICT (user_id, idempotency_key) DO NOTHING');
    expect(client.queries[0]?.params).toEqual([
      'shader-request-1',
      null,
      'user-1',
      'shader-idem-1',
      'openai',
      'water glass',
      null,
    ]);
  });

  it('reads the winning row with a fresh query after an idempotency conflict', async () => {
    const row = createShaderRow({ id: 'winner-request' });
    const client = new FakeQueryClient([[], [row]]);
    const repo = new PostgresAiShaderRequestRepository(client);

    await expect(
      repo.claim({
        id: 'loser-request',
        userId: 'user-1',
        idempotencyKey: 'shader-idem-1',
        mode: 'openai',
        prompt: 'water glass',
      }),
    ).resolves.toEqual({ row, claimed: false });

    expect(client.queries).toHaveLength(2);
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain('WHERE user_id = $1 AND idempotency_key = $2');
  });

  it('stores a generated candidate without accepting it or changing its prior quota reservation', async () => {
    const row = createShaderRow({ status: 'generated' });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAiShaderRequestRepository(client);
    const responseJson: JsonObject = { prompt: 'water glass', source: 'openai' };
    const providerUsageJson: JsonObject = { inputTokens: 20, outputTokens: 40 };

    await expect(
      repo.markGenerated({
        id: 'shader-request-1',
        responseJson,
        providerRequestId: 'req-openai-1',
        providerUsageJson,
      }),
    ).resolves.toBe(row);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain("WHERE id = $1 AND status = 'pending'");
    expect(sql).not.toContain('ai_usage_monthly');
    expect(sql).toContain("SET status = 'generated'");
    expect(sql).toContain('completed_at = NULL');
    expect(client.queries[0]?.params).toEqual(['shader-request-1', responseJson, 'req-openai-1', providerUsageJson]);
  });

  it('atomically starts only the first repair for a rejected shader', async () => {
    const row = createShaderRow({ status: 'repairing', repair_count: 1 });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAiShaderRequestRepository(client);

    await expect(repo.beginRepair('shader-request-1')).resolves.toBe(row);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain("status = 'client_rejected'");
    expect(sql).toContain('repair_count = 0');
    expect(sql).toContain('repair_count = repair_count + 1');
  });

  it('accepts only the exact candidate revision validated by the browser', async () => {
    const row = createShaderRow({ status: 'accepted', repair_count: 1 });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresAiShaderRequestRepository(client);
    const completedAt = new Date('2026-05-20T10:02:00.000Z');

    await expect(repo.markAccepted('shader-request-1', 1, completedAt)).resolves.toBe(row);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain("status = 'generated' AND repair_count = $3");
    expect(client.queries[0]?.params).toEqual(['shader-request-1', completedAt, 1]);
  });
});

describe('PostgresUsageRepository', () => {
  it('reserves quota atomically only while the monthly limit has room', async () => {
    const row = createUsageRow({ generation_count: 10 });
    const client = new FakeQueryClient([[row]]);
    const repo = new PostgresUsageRepository(client);

    await expect(
      repo.reserveMonthlyGeneration({ userId: 'user-1', period: '2026-05', generationLimit: 10 }),
    ).resolves.toBe(row);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('WHERE ai_usage_monthly.generation_count < EXCLUDED.generation_limit');
    expect(client.queries[0]?.params).toEqual(['user-1', '2026-05', 10]);
  });

  it('returns null when an atomic quota reservation cannot be made', async () => {
    const repo = new PostgresUsageRepository(new FakeQueryClient([[]]));

    await expect(
      repo.reserveMonthlyGeneration({ userId: 'user-1', period: '2026-05', generationLimit: 10 }),
    ).resolves.toBeNull();
  });
});

function createJobRow(overrides: Partial<AiGenerationJobRow>): AiGenerationJobRow {
  const now = new Date('2026-05-20T10:00:00.000Z');
  return {
    id: 'job',
    operation_id: null,
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

function createShaderRow(overrides: Partial<AiShaderRequestRow> = {}): AiShaderRequestRow {
  return {
    id: 'shader-request-1',
    operation_id: null,
    user_id: 'user-1',
    idempotency_key: 'shader-idem-1',
    mode: 'openai',
    prompt: 'water glass',
    parent_request_id: null,
    status: 'pending',
    response_json: null,
    provider_request_id: null,
    provider_usage_json: null,
    error_status: null,
    error_code: null,
    error_message: null,
    compiler_diagnostic_json: null,
    repair_count: 0,
    created_at: new Date('2026-05-20T10:00:00.000Z'),
    completed_at: null,
    ...overrides,
  };
}

function createUsageRow(overrides: Partial<AiUsageMonthlyRow> = {}): AiUsageMonthlyRow {
  return {
    user_id: 'user-1',
    period: '2026-05',
    generation_limit: 10,
    generation_count: 1,
    committed_generation_count: 1,
    reserved_generation_count: 0,
    provider_cost_micro_usd: '0',
    input_tokens: '0',
    output_tokens: '0',
    failed_call_count: 0,
    estimated_cost: '0',
    updated_at: new Date('2026-05-20T10:00:00.000Z'),
    ...overrides,
  };
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}
