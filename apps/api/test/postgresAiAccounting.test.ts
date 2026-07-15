import { describe, expect, it } from 'vitest';
import {
  PostgresAdminAuditRepository,
  PostgresAiUsageEventRepository,
  PostgresProviderReconciliationRepository,
} from '../src/db/postgresAiAccounting.js';
import type { AdminAuditEventRow, AiUsageEventRow, ProviderReconciliationRow } from '../src/db/types.js';
import { createFakeQueryClient } from './helpers/fakeQueryClient.js';

describe('Postgres AI accounting repositories', () => {
  it('appends normalized provider usage with immutable pricing metadata', async () => {
    const row: AiUsageEventRow = {
      id: 'usage-1',
      operation_id: 'operation-1',
      user_id: 'user-1',
      feature: 'shader_create',
      provider: 'openai',
      model: 'gpt-5.5',
      status: 'succeeded',
      provider_request_id: 'req-1',
      usage_json: { inputTokens: 120, outputTokens: 340 },
      cost_micro_usd: '10800',
      pricing_version: 'openai-2026-07-01',
      created_at: new Date('2026-07-12T10:00:00.000Z'),
    };
    const client = createFakeQueryClient([[row]]);
    const repository = new PostgresAiUsageEventRepository(client);

    await expect(
      repository.append({
        id: 'usage-1',
        operationId: 'operation-1',
        userId: 'user-1',
        feature: 'shader_create',
        provider: 'openai',
        model: 'gpt-5.5',
        status: 'succeeded',
        providerRequestId: 'req-1',
        usage: { inputTokens: 120, outputTokens: 340 },
        costMicroUsd: '10800',
        pricingVersion: 'openai-2026-07-01',
      }),
    ).resolves.toBe(row);

    expect(client.calls[0]?.sql).toContain('INSERT INTO ai_usage_events');
    expect(client.calls[0]?.values).toEqual([
      'usage-1',
      'operation-1',
      'user-1',
      'shader_create',
      'openai',
      'gpt-5.5',
      'succeeded',
      'req-1',
      { inputTokens: 120, outputTokens: 340 },
      '10800',
      'openai-2026-07-01',
      null,
    ]);
    expect(client.calls[0]?.sql).toContain('INSERT INTO ai_usage_monthly');
  });

  it('appends an immutable admin audit event', async () => {
    const row = { id: 'audit-1', reason: 'Closed alpha access' } as AdminAuditEventRow;
    const client = createFakeQueryClient([[row]]);
    const repository = new PostgresAdminAuditRepository(client);

    await expect(
      repository.append({
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
    ).resolves.toBe(row);

    expect(client.calls[0]?.sql).toContain('INSERT INTO admin_audit_events');
    expect(client.calls[0]?.values).toEqual([
      'audit-1',
      'admin-1',
      'user-1',
      'tier.assign',
      'tier_assignment',
      'assignment-1',
      'Closed alpha access',
      { tier: 'free' },
      { tier: 'creator' },
      null,
    ]);
  });

  it('serializes operation recovery and reads its idempotency and cooldown audit records', async () => {
    const row = {
      id: 'audit-1',
      action: 'ai_operations.reconcile',
      entity_id: 'recovery-1',
    } as AdminAuditEventRow;
    const client = createFakeQueryClient([[], [row], [row]]);
    const repository = new PostgresAdminAuditRepository(client);

    await repository.lockAction('ai_operations.reconcile');
    await expect(repository.findByActionEntity('ai_operations.reconcile', 'recovery-1')).resolves.toBe(row);
    await expect(repository.findLatestByAction('ai_operations.reconcile')).resolves.toBe(row);

    expect(client.calls[0]?.sql).toContain('pg_advisory_xact_lock');
    expect(client.calls[0]?.values).toEqual(['admin-action:ai_operations.reconcile']);
    expect(client.calls[1]?.values).toEqual(['ai_operations.reconcile', 'recovery-1']);
    expect(client.calls[2]?.values).toEqual(['ai_operations.reconcile']);
  });

  it('upserts provider reconciliation by provider and UTC day', async () => {
    const row = {
      id: 'reconciliation-1',
      provider: 'openai',
      usage_date: '2026-07-11',
      status: 'succeeded',
    } as ProviderReconciliationRow;
    const client = createFakeQueryClient([[row]]);
    const repository = new PostgresProviderReconciliationRepository(client);

    await expect(
      repository.upsert({
        id: 'reconciliation-1',
        provider: 'openai',
        usageDate: '2026-07-11',
        status: 'succeeded',
        providerCostMicroUsd: '12500',
        internalCostMicroUsd: '12000',
        syncedAt: new Date('2026-07-12T05:00:00.000Z'),
      }),
    ).resolves.toBe(row);

    expect(client.calls[0]?.sql).toContain('ON CONFLICT (provider, usage_date)');
    expect(client.calls[0]?.values).toEqual([
      'reconciliation-1',
      'openai',
      '2026-07-11',
      'succeeded',
      '12500',
      '12000',
      null,
      new Date('2026-07-12T05:00:00.000Z'),
    ]);
  });
});
