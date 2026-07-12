import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createPostgresRepositories } from '../src/db/postgres.js';

const testDatabaseUrl = process.env.API_TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');
const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl }) : null;

afterAll(async () => {
  await pool?.end();
});

integrationDescribe('account tier Postgres integration', () => {
  it('persists the v0.41 account, operation, usage, and audit foundation atomically', async () => {
    if (!pool) throw new Error('API_TEST_DATABASE_URL is required for this test.');
    const schema = `artifact_account_tiers_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        await client.query(readFileSync(resolve(migrationsDir, file), 'utf8'));
      }
      await client.query(
        `INSERT INTO users (id, email, role) VALUES
          ('user-1', 'user@example.com', 'user'),
          ('admin-1', 'admin@example.com', 'admin')`,
      );

      const repositories = createPostgresRepositories(client);
      await expect(repositories.accountTiers.ensureAccess('user-1')).resolves.toMatchObject({ tier: 'free' });
      await expect(
        repositories.accountTiers.assignTier({
          id: 'assignment-1',
          userId: 'user-1',
          expectedTier: 'free',
          expectedVersion: 0,
          newTier: 'creator',
          reason: 'Closed alpha access',
          adminUserId: 'admin-1',
          idempotencyKey: 'tier-idem-1',
        }),
      ).resolves.toMatchObject({ assigned: true, row: { new_tier: 'creator' } });

      await repositories.accountTiers.createQuotaGrant({
        id: 'grant-1',
        userId: 'user-1',
        period: '2026-07',
        amount: 10,
        reason: 'Support adjustment',
        adminUserId: 'admin-1',
        idempotencyKey: 'grant-idem-1',
      });
      await repositories.accountTiers.createQuotaGrantReversal({
        id: 'reversal-1',
        grantId: 'grant-1',
        amount: 4,
        reason: 'Correct grant amount',
        adminUserId: 'admin-1',
        idempotencyKey: 'reversal-idem-1',
      });
      await expect(
        repositories.accountTiers.createQuotaGrantReversal({
          id: 'reversal-1',
          grantId: 'grant-1',
          amount: 4,
          reason: 'Correct grant amount',
          adminUserId: 'admin-1',
          idempotencyKey: 'reversal-idem-1',
        }),
      ).resolves.toMatchObject({ created: false, row: { id: 'reversal-1' } });
      await expect(repositories.accountTiers.sumQuotaAdjustments('user-1', '2026-07')).resolves.toEqual({
        granted: 10,
        reversed: 4,
      });
      await expect(
        repositories.accountTiers.createQuotaGrantReversal({
          id: 'missing-reversal',
          grantId: 'missing-grant',
          amount: 1,
          reason: 'Missing grant',
          adminUserId: 'admin-1',
          idempotencyKey: 'missing-reversal-idem',
        }),
      ).rejects.toThrow('Quota grant not found: missing-grant');
      await expect(
        repositories.accountTiers.createQuotaGrantReversal({
          id: 'reversal-2',
          grantId: 'grant-1',
          amount: 7,
          reason: 'Too much',
          adminUserId: 'admin-1',
          idempotencyKey: 'reversal-idem-2',
        }),
      ).rejects.toThrow('Quota grant reversal exceeds remaining grant amount: grant-1');

      await expect(
        repositories.operations.claim({
          id: 'operation-1',
          userId: 'user-1',
          feature: 'shader_create',
          idempotencyKey: 'operation-idem-1',
          reservationPeriod: '2026-07',
          reservedGenerations: 1,
        }),
      ).resolves.toMatchObject({ claimed: true, row: { status: 'reserved' } });
      await expect(
        repositories.operations.claim({
          id: 'operation-2',
          userId: 'user-1',
          feature: 'image_create',
          idempotencyKey: 'operation-idem-2',
          reservationPeriod: '2026-07',
          reservedGenerations: 1,
        }),
      ).rejects.toThrow('Active AI operation already exists for user: user-1');

      await expect(
        repositories.usageEvents.append({
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
      ).resolves.toMatchObject({ cost_micro_usd: '10800' });
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
      ).resolves.toMatchObject({ id: 'audit-1' });
      await expect(
        repositories.reconciliations.upsert({
          id: 'reconciliation-1',
          provider: 'openai',
          usageDate: '2026-07-11',
          status: 'succeeded',
          providerCostMicroUsd: '11000',
          internalCostMicroUsd: '10800',
          syncedAt: new Date('2026-07-12T05:00:00.000Z'),
        }),
      ).resolves.toMatchObject({ provider_cost_micro_usd: '11000' });
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });
});
