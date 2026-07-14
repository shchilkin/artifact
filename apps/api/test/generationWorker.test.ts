import { describe, expect, it, vi } from 'vitest';
import { AccountAccessService } from '../src/accountAccessService.js';
import type { GenerationQueuePayload } from '../src/contracts.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { processGenerationJob } from '../src/generationWorker.js';
import {
  createMockImageProvider,
  createProviderRegistry,
  type ImageGenerationProvider,
} from '../src/providers/index.js';
import type { QueueJob } from '../src/queue.js';
import type { AssetStorage } from '../src/storage/index.js';

function createQueueJob(): QueueJob<GenerationQueuePayload> {
  return {
    id: 'job-1',
    name: 'ai-generation',
    data: { kind: 'image', jobId: 'job-1', userId: 'user-1' },
    attemptsMade: 1,
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
    status: 'running',
  };
}

async function seedQueuedJob(store: InMemoryApiStore, withOperation = false) {
  store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
  let operationId: string | null = null;
  if (withOperation) {
    store.seedAccountAccess('user-1', 'creator');
    const reservation = await new AccountAccessService(store.repositories(), {
      now: () => new Date('2026-05-20T10:00:00.000Z'),
      createId: () => 'operation-1',
    }).reserve({ userId: 'user-1', feature: 'image_create', idempotencyKey: 'request-1' });
    if (!reservation.ok) throw new Error('Expected image operation reservation.');
    operationId = reservation.operation.id;
  }
  return store.createGenerationJob({
    id: 'job-1',
    operationId,
    userId: 'user-1',
    provider: 'openai',
    model: 'openai-mock-image',
    prompt: 'grainy shoegaze cover',
    settingsJson: { aspect: '1:1', quality: 'draft' },
    idempotencyKey: 'request-1',
  });
}

function createStorage(): AssetStorage {
  return {
    writeImage: vi.fn(async (input) => ({
      storageKey: `generated/${input.assetId}.svg`,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    })),
    readImage: vi.fn(),
    deleteImage: vi.fn(async () => undefined),
  };
}

function createProvider(
  result: Partial<Awaited<ReturnType<ImageGenerationProvider['generateImage']>>>,
): ImageGenerationProvider {
  return {
    provider: 'openai',
    defaultModel: 'openai-mock-image',
    generateImage: vi.fn(async () => {
      const output: Awaited<ReturnType<ImageGenerationProvider['generateImage']>> = {
        provider: 'openai',
        model: 'openai-mock-image',
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
        width: 1024,
        height: 1024,
        ...result,
      };
      return output;
    }),
  };
}

describe('processGenerationJob', () => {
  it('does not call the provider when the global safety budget is exhausted', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store, true);
    const repositories = store.repositories();
    await repositories.usageEvents.append({
      id: 'budget-spend-1',
      userId: 'user-1',
      feature: 'shader_create',
      provider: 'openai',
      model: 'gpt-5.5',
      status: 'succeeded',
      usage: {},
      costMicroUsd: '30000000',
      pricingVersion: 'test-v1',
      createdAt: new Date('2026-05-20T09:00:00.000Z'),
    });
    const provider = createProvider({});

    await processGenerationJob(createQueueJob(), {
      repositories,
      providers: createProviderRegistry([provider]),
      storage: createStorage(),
      now: () => new Date('2026-05-20T10:01:00.000Z'),
    });

    expect(provider.generateImage).not.toHaveBeenCalled();
    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      error_code: 'ai_budget_exhausted',
      retryable: false,
    });
  });

  it('marks queued jobs as succeeded and creates a generated asset', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store, true);
    const storage = createStorage();

    await processGenerationJob(createQueueJob(), {
      repositories: store.repositories(),
      providers: createProviderRegistry([createMockImageProvider({ provider: 'openai' })]),
      storage,
      createId: () => 'asset-1',
      now: () => new Date('2026-05-20T10:01:00.000Z'),
    });

    const job = await store.findGenerationJobByIdForUser('job-1', 'user-1');
    const asset = await store.findAssetByIdForUser('asset-1', 'user-1');
    expect(job).toMatchObject({
      status: 'succeeded',
      output_asset_id: 'asset-1',
    });
    expect(asset).toMatchObject({
      kind: 'generated-image',
      mime_type: 'image/svg+xml',
      storage_key: 'generated/asset-1.svg',
      metadata_json: {
        provider: 'openai',
        model: 'openai-mock-image',
        prompt: 'grainy shoegaze cover',
      },
    });
    expect(storage.writeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        mimeType: 'image/svg+xml',
      }),
    );
    await expect(store.repositories().operations.findById('operation-1')).resolves.toMatchObject({
      status: 'succeeded',
    });
    await expect(
      new AccountAccessService(store.repositories(), {
        now: () => new Date('2026-05-20T10:01:00.000Z'),
      }).getAllowance('user-1'),
    ).resolves.toMatchObject({
      committed: 1,
      reserved: 0,
    });
  });

  it('resumes a running job recovered by the queue after a worker restart', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store, true);
    const repositories = store.repositories();
    await repositories.jobs.markRunning('job-1', new Date('2026-05-20T10:00:30.000Z'));
    await repositories.operations.markRunning('operation-1', new Date('2026-05-20T10:00:30.000Z'));

    await processGenerationJob(createQueueJob(), {
      repositories,
      providers: createProviderRegistry([createMockImageProvider({ provider: 'openai' })]),
      storage: createStorage(),
      createId: () => 'asset-1',
      now: () => new Date('2026-05-20T10:01:00.000Z'),
    });

    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'succeeded',
      output_asset_id: 'asset-1',
      attempt_count: 1,
    });
    await expect(repositories.operations.findById('operation-1')).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('marks jobs as failed when provider generation fails', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store, true);
    const provider: ImageGenerationProvider = {
      provider: 'openai',
      defaultModel: 'openai-mock-image',
      generateImage: vi.fn(async () => {
        throw new Error('provider exploded');
      }),
    };

    await processGenerationJob(createQueueJob(), {
      repositories: store.repositories(),
      providers: createProviderRegistry([provider]),
      storage: createStorage(),
      now: () => new Date('2026-05-20T10:01:00.000Z'),
    });

    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      error_code: 'provider_error',
      error_message: 'provider exploded',
      retryable: true,
    });
    await expect(store.repositories().operations.findById('operation-1')).resolves.toMatchObject({ status: 'failed' });
    await expect(store.repositories().usage.findMonthlyUsage('user-1', '2026-05')).resolves.toMatchObject({
      failed_call_count: 1,
    });
    await expect(
      new AccountAccessService(store.repositories(), {
        now: () => new Date('2026-05-20T10:01:00.000Z'),
      }).getAllowance('user-1'),
    ).resolves.toMatchObject({
      committed: 0,
      reserved: 0,
      remaining: 20,
    });
  });

  it('retries accounting without rolling back a usable generated result', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store, true);
    const storage = createStorage();
    const repositories = store.repositories();
    const markSucceeded = vi
      .fn(repositories.operations.markSucceeded)
      .mockRejectedValueOnce(new Error('temporary accounting failure'));

    await processGenerationJob(createQueueJob(), {
      repositories: {
        ...repositories,
        operations: { ...repositories.operations, markSucceeded },
      },
      providers: createProviderRegistry([createMockImageProvider({ provider: 'openai' })]),
      storage,
      createId: () => 'asset-1',
      now: () => new Date('2026-05-20T10:01:00.000Z'),
    });

    expect(markSucceeded).toHaveBeenCalledTimes(2);
    expect(storage.deleteImage).not.toHaveBeenCalled();
    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'succeeded',
      output_asset_id: 'asset-1',
    });
    await expect(repositories.operations.findById('operation-1')).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('rejects invalid provider output without writing storage', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store);
    const storage = createStorage();

    await processGenerationJob(createQueueJob(), {
      repositories: store.repositories(),
      providers: createProviderRegistry([createProvider({ mimeType: 'application/json' })]),
      storage,
    });

    expect(storage.writeImage).not.toHaveBeenCalled();
    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      error_code: 'invalid_provider_output',
      retryable: false,
    });
  });

  it('cleans up written storage when asset record creation fails', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store);
    const storage = createStorage();
    const repositories = store.repositories();

    await processGenerationJob(createQueueJob(), {
      repositories: {
        ...repositories,
        assets: {
          ...repositories.assets,
          create: vi.fn(async () => {
            throw new Error('asset insert failed');
          }),
        },
      },
      providers: createProviderRegistry([createProvider({})]),
      storage,
      createId: () => 'asset-1',
    });

    expect(storage.deleteImage).toHaveBeenCalledWith('generated/asset-1.svg');
    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      error_code: 'asset_write_failed',
      retryable: true,
    });
  });
});
