import { randomUUID } from 'node:crypto';
import type { ApiRepositories } from './db/repositories.js';

interface ProviderCosts {
  getCost(input: { from: Date; to: Date }): Promise<{ costMicroUsd: string }>;
}

export class ProviderReconciliationService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly repositories: Pick<ApiRepositories, 'usageEvents' | 'reconciliations'>,
    private readonly options: { costs: ProviderCosts; now?: () => Date; createId?: () => string },
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async reconcilePreviousUtcDay() {
    const to = startOfUtcDay(this.now());
    const from = new Date(to.getTime() - 86_400_000);
    const usageDate = from.toISOString().slice(0, 10);
    const internal = await this.repositories.usageEvents.sumCost({ from, to, provider: 'openai' });
    try {
      const provider = await this.options.costs.getCost({ from, to });
      return this.repositories.reconciliations.upsert({
        id: this.createId(),
        provider: 'openai',
        usageDate,
        status: 'succeeded',
        providerCostMicroUsd: provider.costMicroUsd,
        internalCostMicroUsd: internal.costMicroUsd,
        syncedAt: this.now(),
      });
    } catch (error) {
      await this.repositories.reconciliations.upsert({
        id: this.createId(),
        provider: 'openai',
        usageDate,
        status: 'failed',
        providerCostMicroUsd: null,
        internalCostMicroUsd: internal.costMicroUsd,
        errorCode: 'provider_costs_unavailable',
        syncedAt: this.now(),
      });
      throw error;
    }
  }
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
