import { describe, expect, it } from 'vitest';
import { PostgresAdminReadRepository } from '../src/db/postgresAdminRead.js';
import { createFakeQueryClient } from './helpers/fakeQueryClient.js';

const account = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'user',
  tier: 'creator',
  tier_version: 1,
  committed_generation_count: 2,
  reserved_generation_count: 0,
  provider_cost_micro_usd: '12000',
  failed_call_count: 0,
  created_at: new Date('2026-07-01T00:00:00.000Z'),
  updated_at: new Date('2026-07-12T00:00:00.000Z'),
  total_count: '1',
};

describe('PostgresAdminReadRepository', () => {
  it('uses metadata-only joins for overview and account search', async () => {
    const client = createFakeQueryClient([
      [
        {
          free_count: 1,
          creator_count: 2,
          founder_count: 1,
          committed_generation_count: 4,
          reserved_generation_count: 1,
          provider_cost_micro_usd: '12000',
          input_tokens: '100',
          output_tokens: '200',
          failed_call_count: 1,
        },
      ],
      [],
    ]);
    const repository = new PostgresAdminReadRepository(client);

    await repository.getOverview('2026-07');
    await repository.listAccounts({ period: '2026-07', search: 'creator', limit: 25, offset: 0 });

    expect(client.calls[0]?.sql).toContain('LEFT JOIN account_access');
    expect(client.calls[0]?.sql).toContain('LEFT JOIN ai_usage_monthly');
    expect(client.calls[1]?.sql).toContain('COUNT(*) OVER()');
    expect(client.calls[1]?.values).toEqual(['2026-07', '%creator%', 25, 0]);
    expect(client.calls.map((call) => call.sql).join(' ')).not.toMatch(/prompt|shader_requests|assets|projects/i);
  });

  it('filters usage using normalized metadata columns', async () => {
    const client = createFakeQueryClient([[]]);
    const repository = new PostgresAdminReadRepository(client);

    await repository.listUsage({ userId: 'user-1', provider: 'openai', status: 'failed', limit: 20, offset: 40 });

    expect(client.calls[0]?.sql).toContain('FROM ai_usage_events');
    expect(client.calls[0]?.values).toEqual(['user-1', 'openai', 'failed', 20, 40]);
  });

  it('loads account history through metadata-only tables', async () => {
    const client = createFakeQueryClient([[account], [], [], [], []]);
    const repository = new PostgresAdminReadRepository(client);

    await expect(repository.getAccount('user-1', '2026-07')).resolves.toMatchObject({
      account: { id: 'user-1', tier: 'creator' },
      assignments: [],
      grants: [],
      reversals: [],
      audits: [],
    });

    const sql = client.calls.map((call) => call.sql).join(' ');
    expect(sql).toContain('tier_assignments');
    expect(sql).toContain('quota_grants');
    expect(sql).toContain('admin_audit_events');
    expect(sql).not.toMatch(/prompt|shader_requests|assets|projects/i);
  });

  it('lists recent provider reconciliation metadata', async () => {
    const client = createFakeQueryClient([[]]);
    const repository = new PostgresAdminReadRepository(client);

    await repository.listReconciliations(30);

    expect(client.calls[0]?.sql).toContain('FROM provider_reconciliations');
    expect(client.calls[0]?.values).toEqual([30]);
  });
});
