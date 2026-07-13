import { describe, expect, it } from 'vitest';
import { InMemoryApiStore } from '../src/db/memory.js';
import { SafetyBudgetService } from '../src/safetyBudgetService.js';

describe('SafetyBudgetService', () => {
  it('reports normal, warning, and stopped states for the current UTC month', async () => {
    const store = new InMemoryApiStore();
    const user = store.seedUser({ id: 'user-1' });
    const repositories = store.repositories();
    const now = new Date('2026-07-12T12:00:00.000Z');
    const service = new SafetyBudgetService(repositories.usageEvents, {
      now: () => now,
      limitMicroUsd: 30_000_000n,
      warningMicroUsd: 24_000_000n,
    });

    await expect(service.getSnapshot()).resolves.toMatchObject({ state: 'normal', spentMicroUsd: '0' });
    await repositories.usageEvents.append(usageEvent(user.id, 'usage-warning', '24000000', now));
    await repositories.usageEvents.append(usageEvent(user.id, 'usage-warning', '24000000', now));
    await expect(service.getSnapshot()).resolves.toMatchObject({ state: 'warning', spentMicroUsd: '24000000' });
    await expect(repositories.usage.findMonthlyUsage(user.id, '2026-07')).resolves.toMatchObject({
      provider_cost_micro_usd: '24000000',
      input_tokens: '1',
      failed_call_count: 0,
    });
    await repositories.usageEvents.append(usageEvent(user.id, 'usage-stop', '6000000', now));
    await expect(service.check()).resolves.toMatchObject({ allowed: false, code: 'ai_budget_exhausted' });
  });

  it('does not include prior UTC months', async () => {
    const store = new InMemoryApiStore();
    const user = store.seedUser({ id: 'user-1' });
    const repositories = store.repositories();
    await repositories.usageEvents.append(
      usageEvent(user.id, 'usage-old', '30000000', new Date('2026-06-30T23:59:59.999Z')),
    );
    const service = new SafetyBudgetService(repositories.usageEvents, {
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });

    await expect(service.check()).resolves.toMatchObject({ allowed: true, snapshot: { spentMicroUsd: '0' } });
  });
});

function usageEvent(userId: string, id: string, costMicroUsd: string, createdAt: Date) {
  return {
    id,
    userId,
    feature: 'shader_create' as const,
    provider: 'openai',
    model: 'gpt-5.5',
    status: 'succeeded' as const,
    usage: { inputTokens: 1 },
    costMicroUsd,
    pricingVersion: 'test-v1',
    createdAt,
  };
}
