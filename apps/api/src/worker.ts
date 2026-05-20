import { loadConfig } from './config.js';
import { createMockImageProvider, createProviderRegistry } from './providers/index.js';
import { createBullMqGenerationQueue, createInMemoryGenerationQueue } from './queue.js';

const config = loadConfig();
const queue =
  config.queueDriver === 'bullmq' ? createBullMqGenerationQueue(config.redisUrl) : createInMemoryGenerationQueue();
const providers = createProviderRegistry([
  createMockImageProvider({ provider: 'openai' }),
  createMockImageProvider({ provider: 'xai' }),
]);

const worker = queue.process(async (job) => {
  const provider = providers.get('openai');
  const result = await provider.generateImage({
    jobId: job.data.jobId,
    userId: job.data.userId,
    provider: provider.provider,
    model: provider.defaultModel,
    prompt: `Mock generation for ${job.data.jobId}`,
    settings: {
      aspect: '1:1',
      quality: 'draft',
    },
  });

  console.log('Artifact AI mock generation completed', {
    jobId: job.data.jobId,
    provider: result.provider,
    model: result.model,
    mimeType: result.mimeType,
    bytes: result.bytes.byteLength,
  });
});

console.log('Artifact AI worker scaffold loaded', {
  redisUrlConfigured: Boolean(config.redisUrl),
  queueDriver: config.queueDriver,
  storageDriver: config.assetStorageDriver,
  providers: providers.list().map((provider) => provider.provider),
  workerReady: Boolean(worker),
});
