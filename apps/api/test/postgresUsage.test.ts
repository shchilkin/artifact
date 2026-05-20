import { describe, expect, it } from 'vitest';
import { type PostgresQueryClient, PostgresUsageRepository } from '../src/db/postgresUsage.js';
import type { AiUsageMonthlyRow } from '../src/db/types.js';

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

class FakeQueryClient implements PostgresQueryClient {
  readonly calls: QueryCall[] = [];

  constructor(private readonly results: unknown[][]) {}

  async query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }> {
    this.calls.push({ sql, values });
    return { rows: (this.results.shift() ?? []) as Row[] };
  }
}

const usage: AiUsageMonthlyRow = {
  user_id: 'user-1',
  period: '2026-05',
  generation_limit: 10,
  generation_count: 2,
  estimated_cost: '0.14',
  updated_at: new Date('2026-05-20T10:00:00.000Z'),
};

describe('PostgresUsageRepository', () => {
  it('finds monthly usage by user and period', async () => {
    const client = new FakeQueryClient([[usage], []]);
    const repository = new PostgresUsageRepository(client);

    await expect(repository.findMonthlyUsage('user-1', '2026-05')).resolves.toEqual(usage);
    await expect(repository.findMonthlyUsage('missing', '2026-05')).resolves.toBeNull();

    expect(client.calls.map((call) => call.values)).toEqual([
      ['user-1', '2026-05'],
      ['missing', '2026-05'],
    ]);
    expect(client.calls[0]?.sql).toContain('FROM ai_usage_monthly');
    expect(client.calls[0]?.sql).toContain('period = $2');
  });

  it('upserts monthly usage with zero deltas by default', async () => {
    const client = new FakeQueryClient([[{ ...usage, generation_count: 0, estimated_cost: '0' }]]);
    const repository = new PostgresUsageRepository(client);

    await expect(
      repository.upsertMonthlyUsage({
        userId: 'user-1',
        period: '2026-05',
        generationLimit: 10,
      }),
    ).resolves.toMatchObject({ generation_count: 0, estimated_cost: '0' });

    expect(client.calls[0]?.values).toEqual(['user-1', '2026-05', 10, 0, '0']);
    expect(client.calls[0]?.sql).toContain('ON CONFLICT (user_id, period)');
    expect(client.calls[0]?.sql).toContain(
      'generation_count = ai_usage_monthly.generation_count + EXCLUDED.generation_count',
    );
  });

  it('upserts monthly usage with generation and cost deltas', async () => {
    const client = new FakeQueryClient([[usage]]);
    const repository = new PostgresUsageRepository(client);

    await expect(
      repository.upsertMonthlyUsage({
        userId: 'user-1',
        period: '2026-05',
        generationLimit: 10,
        generationCountDelta: 2,
        estimatedCostDelta: '0.14',
      }),
    ).resolves.toEqual(usage);

    expect(client.calls[0]?.values).toEqual(['user-1', '2026-05', 10, 2, '0.14']);
    expect(client.calls[0]?.sql).toContain(
      'estimated_cost = ai_usage_monthly.estimated_cost + EXCLUDED.estimated_cost',
    );
    expect(client.calls[0]?.sql).toContain('RETURNING');
  });

  it('counts monthly generations from the usage row', async () => {
    const client = new FakeQueryClient([[usage], []]);
    const repository = new PostgresUsageRepository(client);

    await expect(repository.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(2);
    await expect(repository.countMonthlyGenerations('missing', '2026-05')).resolves.toBe(0);
  });
});
