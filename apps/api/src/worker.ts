import { loadConfig } from './config.js';
import { InMemoryApiStore } from './db/memory.js';
import { createPostgresPool } from './db/pool.js';
import { createPostgresRepositories } from './db/postgres.js';
import { loadApiEnv } from './env.js';
import { processGenerationJob } from './generationWorker.js';
import {
  createMockImageProvider,
  createOpenAiImageProvider,
  createProviderRegistry,
  createXAiImageProvider,
} from './providers/index.js';
import { createBullMqGenerationQueue, createInMemoryGenerationQueue } from './queue.js';
import { LocalAssetStorage } from './storage/index.js';

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

const worker = queue.process(async (job) => {
  await processGenerationJob(job, {
    repositories,
    providers,
    storage,
  });
});

console.log('Artifact AI worker scaffold loaded', {
  redisUrlConfigured: Boolean(config.redisUrl),
  queueDriver: config.queueDriver,
  storageDriver: config.assetStorageDriver,
  providers: providers.list().map((provider) => provider.provider),
  workerReady: Boolean(worker),
});

async function shutdown() {
  await worker.close();
  await queue.close?.();
  await pool?.end();
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
