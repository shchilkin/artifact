import { describe, expect, it, vi } from 'vitest';
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
    data: { jobId: 'job-1', userId: 'user-1' },
    attemptsMade: 1,
    createdAt: new Date('2026-05-20T10:00:00.000Z'),
    status: 'running',
  };
}

async function seedQueuedJob(store: InMemoryApiStore) {
  store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
  return store.createGenerationJob({
    id: 'job-1',
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
    deleteImage: vi.fn(),
  };
}

describe('processGenerationJob', () => {
  it('marks queued jobs as succeeded and creates a generated asset', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store);
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
  });

  it('marks jobs as failed when provider generation fails', async () => {
    const store = new InMemoryApiStore();
    await seedQueuedJob(store);
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
    });

    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      error_code: 'provider_error',
      error_message: 'provider exploded',
      retryable: true,
    });
  });
});
