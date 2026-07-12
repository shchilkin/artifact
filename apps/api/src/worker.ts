import { processGenerationJob } from './generationWorker.js';
import { logInfo } from './logger.js';
import { createApiRuntime } from './runtime.js';
import { SafetyBudgetService } from './safetyBudgetService.js';

const { config, pool, repositories, queue, storage, providers } = createApiRuntime();
const safetyBudget = new SafetyBudgetService(repositories.usageEvents, {
  limitMicroUsd: BigInt(Math.round(config.aiSafetyBudgetUsd * 1_000_000)),
  warningMicroUsd: BigInt(Math.round(config.aiSafetyBudgetUsd * 800_000)),
});

const worker = queue.process(
  async (job) => {
    await processGenerationJob(job, {
      repositories,
      providers,
      storage,
      safetyBudget,
    });
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
