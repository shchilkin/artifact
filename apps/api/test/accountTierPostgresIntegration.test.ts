import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanupAiGenerationData } from '../src/cleanup.js';
import { createPostgresRepositories } from '../src/db/postgres.js';
import { adminTierAssignmentAuditInput } from './helpers/adminAudit.js';

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
        repositories.operations.reserve({
          id: 'operation-1',
          userId: 'user-1',
          feature: 'shader_create',
          idempotencyKey: 'operation-idem-1',
          reservationPeriod: '2026-07',
          reservedGenerations: 1,
          generationLimit: 20,
        }),
      ).resolves.toMatchObject({ claimed: true, row: { status: 'reserved' } });
      await expect(
        repositories.operations.reserve({
          id: 'operation-2',
          userId: 'user-1',
          feature: 'image_create',
          idempotencyKey: 'operation-idem-2',
          reservationPeriod: '2026-07',
          reservedGenerations: 1,
          generationLimit: 20,
        }),
      ).rejects.toThrow('Active AI operation already exists for user: user-1');
      await repositories.operations.markRunning('operation-1', new Date('2026-07-12T10:01:00.000Z'));
      await repositories.operations.markSucceeded('operation-1', new Date('2026-07-12T10:02:00.000Z'));
      await repositories.operations.markSucceeded('operation-1', new Date('2026-07-12T10:02:00.000Z'));
      await expect(
        client.query(
          `SELECT committed_generation_count, reserved_generation_count
           FROM ai_usage_monthly WHERE user_id = 'user-1' AND period = '2026-07'`,
        ),
      ).resolves.toMatchObject({ rows: [{ committed_generation_count: 1, reserved_generation_count: 0 }] });

      await expect(
        repositories.operations.reserve({
          id: 'operation-2',
          userId: 'user-1',
          feature: 'image_create',
          idempotencyKey: 'operation-idem-2',
          reservationPeriod: '2026-07',
          reservedGenerations: 1,
          generationLimit: 20,
        }),
      ).resolves.toMatchObject({ claimed: true, row: { status: 'reserved' } });
      await repositories.operations.release({
        id: 'operation-2',
        status: 'failed',
        errorCode: 'provider_failed',
        completedAt: new Date('2026-07-12T10:03:00.000Z'),
      });
      await expect(
        client.query(
          `SELECT committed_generation_count, reserved_generation_count
           FROM ai_usage_monthly WHERE user_id = 'user-1' AND period = '2026-07'`,
        ),
      ).resolves.toMatchObject({ rows: [{ committed_generation_count: 1, reserved_generation_count: 0 }] });

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
          createdAt: new Date('2026-07-12T10:04:00.000Z'),
        }),
      ).resolves.toMatchObject({ cost_micro_usd: '10800' });
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
          createdAt: new Date('2026-07-12T10:04:00.000Z'),
        }),
      ).resolves.toMatchObject({ id: 'usage-1' });
      await expect(
        client.query(
          `SELECT provider_cost_micro_usd, input_tokens, output_tokens, failed_call_count
           FROM ai_usage_monthly WHERE user_id = 'user-1' AND period = '2026-07'`,
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            provider_cost_micro_usd: '10800',
            input_tokens: '120',
            output_tokens: '340',
            failed_call_count: 0,
          },
        ],
      });
      await expect(
        repositories.usageEvents.sumCost({
          from: new Date('2026-07-01T00:00:00.000Z'),
          to: new Date('2026-08-01T00:00:00.000Z'),
        }),
      ).resolves.toEqual({ costMicroUsd: '10800' });
      await expect(repositories.adminAudit.append(adminTierAssignmentAuditInput())).resolves.toMatchObject({
        id: 'audit-1',
      });
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
      await expect(repositories.adminRead.getOverview('2026-07')).resolves.toMatchObject({
        free_count: 1,
        creator_count: 1,
        founder_count: 0,
        committed_generation_count: 1,
        provider_cost_micro_usd: '10800',
      });
      await expect(
        repositories.adminRead.listAccounts({ period: '2026-07', search: 'user@example.com', limit: 10, offset: 0 }),
      ).resolves.toMatchObject({
        total: 1,
        rows: [{ id: 'user-1', tier: 'creator', committed_generation_count: 1 }],
      });
      await expect(repositories.adminRead.getAccount('user-1', '2026-07')).resolves.toMatchObject({
        account: { id: 'user-1', tier: 'creator' },
        assignments: [{ id: 'assignment-1' }],
        grants: [{ id: 'grant-1', reversed_amount: 4 }],
        reversals: [{ id: 'reversal-1' }],
        audits: [{ id: 'audit-1' }],
      });
      await expect(
        repositories.adminRead.listUsage({ userId: 'user-1', provider: 'openai', limit: 10, offset: 0 }),
      ).resolves.toMatchObject({ total: 1, rows: [{ id: 'usage-1', cost_micro_usd: '10800' }] });
      await expect(repositories.adminRead.listReconciliations(10)).resolves.toMatchObject([
        { id: 'reconciliation-1', provider_cost_micro_usd: '11000' },
      ]);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });

  it('expires an abandoned shader operation and releases its allowance', async () => {
    if (!pool) throw new Error('API_TEST_DATABASE_URL is required for this test.');
    const schema = `artifact_operation_cleanup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        await client.query(readFileSync(resolve(migrationsDir, file), 'utf8'));
      }
      await client.query(`INSERT INTO users (id, email, role) VALUES ('user-cleanup', 'cleanup@example.com', 'user')`);

      const repositories = createPostgresRepositories(client);
      await repositories.operations.reserve({
        id: 'operation-cleanup',
        userId: 'user-cleanup',
        feature: 'shader_create',
        idempotencyKey: 'operation-cleanup-idem',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
        generationLimit: 20,
      });
      await repositories.shaderRequests.claim({
        id: 'shader-cleanup',
        operationId: 'operation-cleanup',
        userId: 'user-cleanup',
        idempotencyKey: 'shader-cleanup-idem',
        mode: 'openai',
        prompt: 'water',
        parentRequestId: null,
      });
      await client.query(
        `UPDATE ai_operations SET created_at = '2026-07-01T00:00:00.000Z' WHERE id = 'operation-cleanup'`,
      );

      await expect(
        cleanupAiGenerationData(client, {
          now: new Date('2026-07-02T00:00:00.000Z'),
          dryRun: false,
          staleActiveOperationMs: 60 * 60 * 1000,
        }),
      ).resolves.toMatchObject({ expiredOperationIds: ['operation-cleanup'] });
      await expect(repositories.operations.findById('operation-cleanup')).resolves.toMatchObject({
        status: 'expired',
        error_code: 'operation_expired',
      });
      await expect(
        repositories.shaderRequests.findByIdForUser('shader-cleanup', 'user-cleanup'),
      ).resolves.toMatchObject({
        status: 'failed',
        error_code: 'operation_expired',
      });
      await expect(repositories.usage.findMonthlyUsage('user-cleanup', '2026-07')).resolves.toMatchObject({
        committed_generation_count: 0,
        reserved_generation_count: 0,
      });

      await repositories.operations.reserve({
        id: 'operation-recover',
        userId: 'user-cleanup',
        feature: 'shader_create',
        idempotencyKey: 'operation-recover-idem',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
        generationLimit: 20,
      });
      await repositories.shaderRequests.claim({
        id: 'shader-recover',
        operationId: 'operation-recover',
        userId: 'user-cleanup',
        idempotencyKey: 'shader-recover-idem',
        mode: 'openai',
        prompt: 'glass',
        parentRequestId: null,
      });
      await repositories.shaderRequests.markGenerated({ id: 'shader-recover', responseJson: { ok: true } });
      await repositories.shaderRequests.markAccepted('shader-recover', 0, new Date('2026-07-02T00:01:00.000Z'));

      await expect(
        cleanupAiGenerationData(client, {
          now: new Date('2026-07-02T00:02:00.000Z'),
          dryRun: false,
        }),
      ).resolves.toMatchObject({ reconciledOperationIds: ['operation-recover'] });
      await expect(repositories.operations.findById('operation-recover')).resolves.toMatchObject({
        status: 'succeeded',
      });
      await expect(repositories.usage.findMonthlyUsage('user-cleanup', '2026-07')).resolves.toMatchObject({
        committed_generation_count: 1,
        reserved_generation_count: 0,
      });
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });
});
