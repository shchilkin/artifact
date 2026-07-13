import { OpenAiCostsClient } from './openAiCosts.js';
import { ProviderReconciliationService } from './providerReconciliationService.js';
import { createApiRuntime } from './runtime.js';

const { config, pool, queue, repositories } = createApiRuntime();
if (!config.openAiAdminKey) throw new Error('OPENAI_ADMIN_KEY is required for provider cost reconciliation.');

try {
  const row = await new ProviderReconciliationService(repositories, {
    costs: new OpenAiCostsClient({ apiKey: config.openAiAdminKey }),
  }).reconcilePreviousUtcDay();
  process.stdout.write(
    `${JSON.stringify({ provider: row.provider, usageDate: row.usage_date, status: row.status })}\n`,
  );
} finally {
  await queue.close?.();
  await pool?.end();
}
