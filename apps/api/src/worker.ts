import { processGenerationJob } from './generationWorker.js';
import { logInfo } from './logger.js';
import { createApiRuntime } from './runtime.js';
import { createConfiguredSafetyBudgetService } from './safetyBudgetService.js';

const { config, pool, repositories, queue, storage, providers, shaderProvider } = createApiRuntime();
const safetyBudget = createConfiguredSafetyBudgetService(repositories.usageEvents, config.aiSafetyBudgetUsd);

const worker = queue.process(
  async (job) => {
    const result = await processGenerationJob(job, {
      repositories,
      providers,
      shaderProvider,
      storage,
      safetyBudget,
    });
    if (result.status === 'failed') throw new Error(`AI operation failed: ${result.code}`);
  },
  { concurrency: 2 },
);

logInfo('worker.started', {
  redisUrlConfigured: Boolean(config.redisUrl),
  queueDriver: config.queueDriver,
  storageDriver: config.assetStorageDriver,
  providers: providers
    .list()
    .map((provider) => provider.provider)
    .join(','),
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
