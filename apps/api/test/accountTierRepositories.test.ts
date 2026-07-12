import { describe, expect, it } from 'vitest';
import { InMemoryApiStore } from '../src/db/memory.js';

describe('account tier repositories', () => {
  it('ensures Free access and reports legacy AI-enabled accounts without assigning Creator', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'legacy-enabled', email: 'enabled@example.com', aiEnabled: true });
    store.seedUser({ id: 'legacy-free', email: 'free@example.com', aiEnabled: false });
    const repositories = store.repositories();

    await expect(repositories.accountTiers.ensureAccess('legacy-enabled')).resolves.toMatchObject({
      user_id: 'legacy-enabled',
      tier: 'free',
      version: 0,
    });
    await expect(repositories.accountTiers.listLegacyAiEnabledUsers()).resolves.toEqual([
      { userId: 'legacy-enabled', email: 'enabled@example.com' },
    ]);
  });

  it('claims one cross-feature AI operation per account and reuses an idempotent claim', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'user-1' });
    const operations = store.repositories().operations;
    const input = {
      id: 'operation-1',
      userId: 'user-1',
      feature: 'shader_create' as const,
      idempotencyKey: 'idem-1',
      reservationPeriod: '2026-07',
      reservedGenerations: 1 as const,
    };

    await expect(operations.claim(input)).resolves.toMatchObject({ claimed: true, row: { id: 'operation-1' } });
    await expect(operations.claim({ ...input, id: 'operation-retry' })).resolves.toMatchObject({
      claimed: false,
      row: { id: 'operation-1' },
    });
    await expect(
      operations.claim({ ...input, id: 'operation-conflict', reservationPeriod: '2026-08' }),
    ).rejects.toThrow('Idempotency key reused with different AI operation input: idem-1');
    await expect(
      operations.claim({
        ...input,
        id: 'operation-2',
        feature: 'image_create',
        idempotencyKey: 'idem-2',
      }),
    ).rejects.toThrow('Active AI operation already exists for user: user-1');
  });

  it('appends normalized provider usage and admin audit records without Creative Content fields', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'user-1' });
    store.seedUser({ id: 'admin-1', role: 'admin' });
    const repositories = store.repositories();

    await expect(
      repositories.usageEvents.append({
        id: 'usage-1',
        userId: 'user-1',
        feature: 'shader_create',
        provider: 'openai',
        model: 'gpt-5.5',
        status: 'succeeded',
        providerRequestId: 'req-1',
        usage: { inputTokens: 120, outputTokens: 340, cachedInputTokens: undefined },
        costMicroUsd: '10800',
        pricingVersion: 'openai-2026-07-01',
      }),
    ).resolves.toMatchObject({
      usage_json: { inputTokens: 120, outputTokens: 340 },
      cost_micro_usd: '10800',
    });

    await expect(
      repositories.adminAudit.append({
        id: 'audit-1',
        adminUserId: 'admin-1',
        targetUserId: 'user-1',
        action: 'tier.assign',
        entityType: 'tier_assignment',
        entityId: 'assignment-1',
        reason: 'Closed alpha access',
        beforeJson: { tier: 'free' },
        afterJson: { tier: 'creator' },
      }),
    ).resolves.toMatchObject({ id: 'audit-1', reason: 'Closed alpha access' });
  });

  it('upserts one provider reconciliation per UTC day', async () => {
    const store = new InMemoryApiStore();
    const reconciliations = store.repositories().reconciliations;

    await expect(
      reconciliations.upsert({
        id: 'reconciliation-1',
        provider: 'openai',
        usageDate: '2026-07-11',
        status: 'pending',
        internalCostMicroUsd: '12000',
      }),
    ).resolves.toMatchObject({ status: 'pending', internal_cost_micro_usd: '12000' });

    await expect(
      reconciliations.upsert({
        id: 'reconciliation-retry',
        provider: 'openai',
        usageDate: '2026-07-11',
        status: 'succeeded',
        providerCostMicroUsd: '12500',
        internalCostMicroUsd: '12000',
        syncedAt: new Date('2026-07-12T05:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      id: 'reconciliation-1',
      status: 'succeeded',
      provider_cost_micro_usd: '12500',
    });
  });

  it('assigns tiers with optimistic concurrency and idempotency', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'user-1' });
    store.seedUser({ id: 'admin-1', role: 'admin' });
    const tiers = store.repositories().accountTiers;
    await tiers.ensureAccess('user-1');
    const input = {
      id: 'assignment-1',
      userId: 'user-1',
      expectedTier: 'free' as const,
      expectedVersion: 0,
      newTier: 'creator' as const,
      reason: 'Closed alpha access',
      adminUserId: 'admin-1',
      idempotencyKey: 'tier-idem-1',
    };

    await expect(tiers.assignTier(input)).resolves.toMatchObject({ assigned: true, row: { new_tier: 'creator' } });
    await expect(tiers.assignTier({ ...input, id: 'assignment-retry' })).resolves.toMatchObject({
      assigned: false,
      row: { id: 'assignment-1' },
    });
    await expect(tiers.assignTier({ ...input, id: 'assignment-conflict', newTier: 'founder' })).rejects.toThrow(
      'Idempotency key reused with different Tier Assignment input: tier-idem-1',
    );
    await expect(tiers.findAccess('user-1')).resolves.toMatchObject({ tier: 'creator', version: 1 });
    await expect(tiers.assignTier({ ...input, id: 'assignment-2', idempotencyKey: 'tier-idem-2' })).rejects.toThrow(
      'Account tier changed since it was loaded: user-1',
    );
  });

  it('adds positive quota grants and prevents reversals above the original grant', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'user-1' });
    store.seedUser({ id: 'admin-1', role: 'admin' });
    const tiers = store.repositories().accountTiers;

    await tiers.createQuotaGrant({
      id: 'grant-1',
      userId: 'user-1',
      period: '2026-07',
      amount: 10,
      reason: 'Support adjustment',
      adminUserId: 'admin-1',
      idempotencyKey: 'grant-idem-1',
    });
    await tiers.createQuotaGrantReversal({
      id: 'reversal-1',
      grantId: 'grant-1',
      amount: 4,
      reason: 'Correct grant amount',
      adminUserId: 'admin-1',
      idempotencyKey: 'reversal-idem-1',
    });

    await expect(tiers.sumQuotaAdjustments('user-1', '2026-07')).resolves.toEqual({ granted: 10, reversed: 4 });
    await expect(
      tiers.createQuotaGrantReversal({
        id: 'reversal-2',
        grantId: 'grant-1',
        amount: 7,
        reason: 'Too much',
        adminUserId: 'admin-1',
        idempotencyKey: 'reversal-idem-2',
      }),
    ).rejects.toThrow('Quota grant reversal exceeds remaining grant amount: grant-1');
  });
});
