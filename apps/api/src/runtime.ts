import { loadConfig } from './config.js';
import { InMemoryApiStore } from './db/memory.js';
import { createPostgresPool } from './db/pool.js';
import { createPostgresRepositories } from './db/postgres.js';
import { loadApiEnv } from './env.js';
import {
  createMockImageProvider,
  createOpenAiImageProvider,
  createProviderRegistry,
  createXAiImageProvider,
} from './providers/index.js';
import { createBullMqGenerationQueue, createInMemoryGenerationQueue } from './queue.js';
import { LocalAssetStorage } from './storage/index.js';

export function createApiRuntime() {
  loadApiEnv();
  const config = loadConfig();
  const store = config.databaseDriver === 'memory' ? new InMemoryApiStore() : null;
  const pool = config.databaseDriver === 'postgres' ? createPostgresPool(config.databaseUrl) : null;
  const repositories = pool ? createPostgresRepositories(pool) : store?.repositories();
  if (!repositories) throw new Error('No API repository backend configured.');

  const queue =
    config.queueDriver === 'bullmq' ? createBullMqGenerationQueue(config.redisUrl) : createInMemoryGenerationQueue();
  const storage = new LocalAssetStorage(config.assetStorageDir);
  const providers = createProviderRegistry([
    config.openAiApiKey
      ? createOpenAiImageProvider({ apiKey: config.openAiApiKey, defaultModel: config.openAiImageModel })
      : createMockImageProvider({ provider: 'openai' }),
    config.xAiApiKey
      ? createXAiImageProvider({ apiKey: config.xAiApiKey, defaultModel: config.xAiImageModel })
      : createMockImageProvider({ provider: 'xai' }),
  ]);

  return { config, store, pool, repositories, queue, storage, providers };
}
