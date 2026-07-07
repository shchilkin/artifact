import { loadConfig } from './config.js';
import { InMemoryApiStore } from './db/memory.js';
import { createPostgresPool } from './db/pool.js';
import { createPostgresRepositories } from './db/postgres.js';
import { loadApiEnv } from './env.js';
import {
  createMockImageProvider,
  createOpenAiImageProvider,
  createOpenAiShaderSpecProvider,
  createProviderRegistry,
  createXAiImageProvider,
} from './providers/index.js';
import { createBullMqGenerationQueue, createInMemoryGenerationQueue } from './queue.js';
import { LocalAssetStorage } from './storage/index.js';

function createApiStore(config: ReturnType<typeof loadConfig>) {
  return config.databaseDriver === 'memory' ? new InMemoryApiStore() : null;
}

function createApiPool(config: ReturnType<typeof loadConfig>) {
  return config.databaseDriver === 'postgres' ? createPostgresPool(config.databaseUrl) : null;
}

function createApiRepositories(pool: ReturnType<typeof createPostgresPool> | null, store: InMemoryApiStore | null) {
  const repositories = pool ? createPostgresRepositories(pool) : store?.repositories();
  if (!repositories) throw new Error('No API repository backend configured.');
  return repositories;
}

function createApiQueue(config: ReturnType<typeof loadConfig>) {
  return config.queueDriver === 'bullmq'
    ? createBullMqGenerationQueue(config.redisUrl)
    : createInMemoryGenerationQueue();
}

function createOpenAiProvider(config: ReturnType<typeof loadConfig>) {
  return config.openAiApiKey
    ? createOpenAiImageProvider({ apiKey: config.openAiApiKey, defaultModel: config.openAiImageModel })
    : createMockImageProvider({ provider: 'openai' });
}

function createShaderSpecProvider(config: ReturnType<typeof loadConfig>) {
  return config.openAiApiKey
    ? createOpenAiShaderSpecProvider({ apiKey: config.openAiApiKey, defaultModel: config.openAiShaderModel })
    : undefined;
}

function createXAiProvider(config: ReturnType<typeof loadConfig>) {
  return config.xAiApiKey
    ? createXAiImageProvider({ apiKey: config.xAiApiKey, defaultModel: config.xAiImageModel })
    : createMockImageProvider({ provider: 'xai' });
}

export function createApiRuntime() {
  loadApiEnv();
  const config = loadConfig();
  const store = createApiStore(config);
  const pool = createApiPool(config);
  const repositories = createApiRepositories(pool, store);
  const queue = createApiQueue(config);
  const storage = new LocalAssetStorage(config.assetStorageDir);
  const providers = createProviderRegistry([createOpenAiProvider(config), createXAiProvider(config)]);
  const shaderSpecProvider = createShaderSpecProvider(config);

  return { config, store, pool, repositories, queue, storage, providers, shaderSpecProvider };
}
