import { randomUUID } from 'node:crypto';
import type { AiOperationFeature } from '@artifact/shared';
import type { AiUsageEventRepository, ProviderUsageMetrics } from './db/types.js';
import { priceProviderUsage } from './providerPricing.js';

export class ProviderUsageService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly usageEvents: AiUsageEventRepository,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  record(input: {
    operationId?: string | null;
    userId: string;
    feature: AiOperationFeature;
    provider: string;
    model: string;
    status: 'succeeded' | 'failed';
    providerRequestId?: string | null;
    usage?: ProviderUsageMetrics;
  }) {
    const usage = input.usage ?? {};
    const price = priceProviderUsage({ provider: input.provider, model: input.model, usage });
    return this.usageEvents.append({
      id: this.createId(),
      operationId: input.operationId,
      userId: input.userId,
      feature: input.feature,
      provider: input.provider,
      model: input.model,
      status: input.status,
      providerRequestId: input.providerRequestId,
      usage,
      ...price,
      createdAt: this.now(),
    });
  }
}
