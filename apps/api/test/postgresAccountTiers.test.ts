import { describe, expect, it } from 'vitest';
import { PostgresAccountTierRepository } from '../src/db/postgresAccountTiers.js';
import type { AccountAccessRow, QuotaGrantReversalRow, QuotaGrantRow, TierAssignmentRow } from '../src/db/types.js';
import { createFakeQueryClient } from './helpers/fakeQueryClient.js';

const access: AccountAccessRow = {
  user_id: 'user-1',
  tier: 'free',
  version: 0,
  created_at: new Date('2026-07-12T10:00:00.000Z'),
  updated_at: new Date('2026-07-12T10:00:00.000Z'),
};

describe('PostgresAccountTierRepository', () => {
  it('ensures Free access without deriving a tier from legacy flags', async () => {
    const client = createFakeQueryClient([[access]]);
    const repository = new PostgresAccountTierRepository(client);

    await expect(repository.ensureAccess('user-1')).resolves.toEqual(access);

    expect(client.calls[0]?.sql).toContain('INSERT INTO account_access');
    expect(client.calls[0]?.sql).toContain("SELECT $1, 'free'");
    expect(client.calls[0]?.sql).toContain('ON CONFLICT (user_id)');
    expect(client.calls[0]?.sql).not.toContain('ai_enabled');
    expect(client.calls[0]?.values).toEqual(['user-1']);
  });

  it('lists legacy AI-enabled accounts only as migration candidates', async () => {
    const candidates = [{ userId: 'user-1', email: 'me@example.com' }];
    const client = createFakeQueryClient([[candidates[0]]]);
    const repository = new PostgresAccountTierRepository(client);

    await expect(repository.listLegacyAiEnabledUsers()).resolves.toEqual(candidates);

    expect(client.calls[0]?.sql).toContain('WHERE ai_enabled = true');
    expect(client.calls[0]?.sql).toContain('ORDER BY id');
  });

  it('assigns a tier only from the expected tier and version', async () => {
    const assignment: TierAssignmentRow = {
      id: 'assignment-1',
      user_id: 'user-1',
      previous_tier: 'free',
      new_tier: 'creator',
      reason: 'Closed alpha access',
      admin_user_id: 'admin-1',
      idempotency_key: 'tier-idem-1',
      created_at: new Date('2026-07-12T10:00:00.000Z'),
    };
    const client = createFakeQueryClient([[access], [{ ...assignment, assigned: true }]]);
    const repository = new PostgresAccountTierRepository(client);

    await expect(
      repository.assignTier({
        id: 'assignment-1',
        userId: 'user-1',
        expectedTier: 'free',
        expectedVersion: 0,
        newTier: 'creator',
        reason: 'Closed alpha access',
        adminUserId: 'admin-1',
        idempotencyKey: 'tier-idem-1',
      }),
    ).resolves.toEqual({ row: assignment, assigned: true });

    expect(client.calls[1]?.sql).toContain('version = account_access.version + 1');
    expect(client.calls[1]?.sql).toContain('tier = $3 AND version = $4');
  });

  it('creates grants and relies on the database reversal trigger for atomic accounting', async () => {
    const grant = { id: 'grant-1', amount: 10, reversed_amount: 0, created: true } as QuotaGrantRow & {
      created: boolean;
    };
    const reversal = { id: 'reversal-1', grant_id: 'grant-1', amount: 4, created: true } as QuotaGrantReversalRow & {
      created: boolean;
    };
    const client = createFakeQueryClient([[grant], [reversal]]);
    const repository = new PostgresAccountTierRepository(client);

    await repository.createQuotaGrant({
      id: 'grant-1',
      userId: 'user-1',
      period: '2026-07',
      amount: 10,
      reason: 'Support adjustment',
      adminUserId: 'admin-1',
      idempotencyKey: 'grant-idem-1',
    });
    await repository.createQuotaGrantReversal({
      id: 'reversal-1',
      grantId: 'grant-1',
      amount: 4,
      reason: 'Correct grant amount',
      adminUserId: 'admin-1',
      idempotencyKey: 'reversal-idem-1',
    });

    expect(client.calls[0]?.sql).toContain('INSERT INTO quota_grants');
    expect(client.calls[1]?.sql).toContain('INSERT INTO quota_grant_reversals');
    expect(client.calls[1]?.sql).toContain('ON CONFLICT (admin_user_id, idempotency_key) DO NOTHING');
  });

  it('distinguishes a missing grant from an exhausted reversal amount', async () => {
    const client = createFakeQueryClient([[], [], []]);
    const repository = new PostgresAccountTierRepository(client);

    await expect(
      repository.createQuotaGrantReversal({
        id: 'reversal-1',
        grantId: 'missing-grant',
        amount: 1,
        reason: 'Correction',
        adminUserId: 'admin-1',
        idempotencyKey: 'reversal-idem-1',
      }),
    ).rejects.toThrow('Quota grant not found: missing-grant');
  });
});
