import { describe, expect, it, vi } from 'vitest';
import { type CleanupQueryClient, cleanupAiGenerationData } from '../src/cleanup.js';

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

class FakeQueryClient implements CleanupQueryClient {
  readonly calls: QueryCall[] = [];

  constructor(private readonly results: unknown[][]) {}

  async query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }> {
    this.calls.push({ sql, values });
    return { rows: (this.results.shift() ?? []) as Row[] };
  }
}

const now = new Date('2026-05-22T09:00:00.000Z');
const cleanupRows = () => [
  [{ id: 'operation-reconciled' }],
  [{ id: 'operation-expired' }],
  [{ id: 'job-expired' }],
  [
    { id: 'asset-orphan', storage_key: 'generated/orphan.png' },
    { id: 'project-asset-orphan', storage_key: 'generated/project-orphan.png' },
  ],
  [
    { id: 'asset-deleted', storage_key: 'generated/deleted.png' },
    { id: 'project-asset-deleted', storage_key: 'generated/project-deleted.png' },
  ],
  [{ storage_key: 'generated/known.png' }],
];
const listLocalStorageKeys = async () => ['generated/known.png', 'generated/missing.png'];

describe('cleanupAiGenerationData', () => {
  it('reports stale jobs, orphan assets, and orphan local files in dry-run mode', async () => {
    const client = new FakeQueryClient(cleanupRows());
    const storage = { deleteImage: vi.fn() };

    await expect(
      cleanupAiGenerationData(client, {
        now,
        dryRun: true,
        assetStorage: storage,
        listLocalStorageKeys,
      }),
    ).resolves.toEqual({
      dryRun: true,
      reconciledOperationIds: ['operation-reconciled'],
      expiredOperationIds: ['operation-expired'],
      expiredJobIds: ['job-expired'],
      softDeletedAssetIds: ['asset-orphan', 'project-asset-orphan'],
      storageKeysDeleted: [],
      orphanStorageKeysDeleted: ['generated/missing.png'],
    });

    expect(storage.deleteImage).not.toHaveBeenCalled();
    expect(client.calls[0]?.sql).toContain("jobs.status = 'succeeded'");
    expect(client.calls[1]?.sql).toContain('FROM ai_operations');
    expect(client.calls[2]?.sql).toContain('SELECT id');
    expect(client.calls[3]?.sql).toContain('SELECT id, storage_key');
    expect(client.calls[3]?.sql).toContain('cloud_projects');
    expect(client.calls[3]?.sql).toContain('artifact-cloud-asset://');
  });

  it('expires stale jobs, soft-deletes orphan assets, and deletes local files when applied', async () => {
    const client = new FakeQueryClient(cleanupRows());
    const storage = { deleteImage: vi.fn(async () => undefined) };

    await expect(
      cleanupAiGenerationData(client, {
        now,
        dryRun: false,
        assetStorage: storage,
        listLocalStorageKeys,
      }),
    ).resolves.toEqual({
      dryRun: false,
      reconciledOperationIds: ['operation-reconciled'],
      expiredOperationIds: ['operation-expired'],
      expiredJobIds: ['job-expired'],
      softDeletedAssetIds: ['asset-orphan', 'project-asset-orphan'],
      storageKeysDeleted: [
        'generated/orphan.png',
        'generated/project-orphan.png',
        'generated/deleted.png',
        'generated/project-deleted.png',
      ],
      orphanStorageKeysDeleted: ['generated/missing.png'],
    });

    expect(storage.deleteImage).toHaveBeenCalledTimes(5);
    expect(storage.deleteImage).toHaveBeenNthCalledWith(1, 'generated/orphan.png');
    expect(storage.deleteImage).toHaveBeenNthCalledWith(2, 'generated/project-orphan.png');
    expect(storage.deleteImage).toHaveBeenNthCalledWith(3, 'generated/deleted.png');
    expect(storage.deleteImage).toHaveBeenNthCalledWith(4, 'generated/project-deleted.png');
    expect(storage.deleteImage).toHaveBeenNthCalledWith(5, 'generated/missing.png');
    expect(client.calls[0]?.sql).toContain("SET status = 'succeeded'");
    expect(client.calls[0]?.sql).toContain('committed_generation_count');
    expect(client.calls[1]?.sql).toContain("SET status = 'expired'");
    expect(client.calls[1]?.sql).toContain('reserved_generation_count');
    expect(client.calls[1]?.sql).toContain('ai_shader_requests');
    expect(client.calls[2]?.sql).toContain('UPDATE ai_generation_jobs');
    expect(client.calls[3]?.sql).toContain('UPDATE assets');
    expect(client.calls[3]?.sql).toContain('cloud_projects');
  });
});
