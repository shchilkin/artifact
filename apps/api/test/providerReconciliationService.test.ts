import { describe, expect, it } from 'vitest';
import { InMemoryApiStore } from '../src/db/memory.js';
import { ProviderReconciliationService } from '../src/providerReconciliationService.js';

describe('ProviderReconciliationService', () => {
  it('reconciles the previous completed UTC day against internal OpenAI events', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'user-1' });
    const repositories = store.repositories();
    await repositories.usageEvents.append({
      id: 'usage-1',
      userId: 'user-1',
      feature: 'shader_create',
      provider: 'openai',
      model: 'gpt-5.5',
      status: 'succeeded',
      usage: { inputTokens: 1 },
      costMicroUsd: '12000',
      pricingVersion: 'test-v1',
      createdAt: new Date('2026-07-11T10:00:00.000Z'),
    });
    const service = new ProviderReconciliationService(repositories, {
      costs: { getCost: async () => ({ costMicroUsd: '12500' }) },
      now: () => new Date('2026-07-12T05:00:00.000Z'),
      createId: () => 'reconciliation-1',
    });

    await expect(service.reconcilePreviousUtcDay()).resolves.toMatchObject({
      provider: 'openai',
      usage_date: '2026-07-11',
      provider_cost_micro_usd: '12500',
      internal_cost_micro_usd: '12000',
      status: 'succeeded',
    });
  });
});
