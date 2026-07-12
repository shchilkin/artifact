import type { AiUsageMonthlyRow, AiUsageRepository, UpsertAiUsageMonthlyInput } from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const usageColumns = `
  user_id,
  period,
  generation_limit,
  generation_count,
  committed_generation_count,
  reserved_generation_count,
  provider_cost_micro_usd,
  input_tokens,
  output_tokens,
  failed_call_count,
  estimated_cost,
  updated_at
`;

export class PostgresUsageRepository implements AiUsageRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async findMonthlyUsage(userId: string, period: string): Promise<AiUsageMonthlyRow | null> {
    const result = await this.client.query<AiUsageMonthlyRow>(
      `
        SELECT ${usageColumns}
        FROM ai_usage_monthly
        WHERE user_id = $1
          AND period = $2
      `,
      [userId, period],
    );
    return result.rows[0] ?? null;
  }

  async upsertMonthlyUsage(input: UpsertAiUsageMonthlyInput): Promise<AiUsageMonthlyRow> {
    const generationCountDelta = input.generationCountDelta ?? 0;
    const estimatedCostDelta = input.estimatedCostDelta ?? '0';
    const result = await this.client.query<AiUsageMonthlyRow>(
      `
        INSERT INTO ai_usage_monthly (
          user_id,
          period,
          generation_limit,
          generation_count,
          estimated_cost
        )
        VALUES ($1, $2, $3, $4, $5::numeric)
        ON CONFLICT (user_id, period)
        DO UPDATE SET
          generation_limit = EXCLUDED.generation_limit,
          generation_count = ai_usage_monthly.generation_count + EXCLUDED.generation_count,
          estimated_cost = ai_usage_monthly.estimated_cost + EXCLUDED.estimated_cost,
          updated_at = now()
        RETURNING ${usageColumns}
      `,
      [input.userId, input.period, input.generationLimit, generationCountDelta, estimatedCostDelta],
    );
    return requireSingleRow(result.rows, `Monthly usage was not upserted: ${input.userId}:${input.period}`);
  }

  async countMonthlyGenerations(userId: string, period: string): Promise<number> {
    const row = await this.findMonthlyUsage(userId, period);
    return row?.generation_count ?? 0;
  }

  async reserveMonthlyGeneration(input: {
    userId: string;
    period: string;
    generationLimit: number;
  }): Promise<AiUsageMonthlyRow | null> {
    const result = await this.client.query<AiUsageMonthlyRow>(
      `
        INSERT INTO ai_usage_monthly (
          user_id,
          period,
          generation_limit,
          generation_count,
          estimated_cost
        )
        SELECT $1, $2, $3, 1, 0
        WHERE $3 > 0
        ON CONFLICT (user_id, period)
        DO UPDATE SET
          generation_limit = EXCLUDED.generation_limit,
          generation_count = ai_usage_monthly.generation_count + 1,
          updated_at = now()
        WHERE ai_usage_monthly.generation_count < EXCLUDED.generation_limit
        RETURNING ${usageColumns}
      `,
      [input.userId, input.period, input.generationLimit],
    );
    return result.rows[0] ?? null;
  }

  async releaseMonthlyGeneration(userId: string, period: string): Promise<AiUsageMonthlyRow | null> {
    const result = await this.client.query<AiUsageMonthlyRow>(
      `
        UPDATE ai_usage_monthly
        SET generation_count = GREATEST(0, generation_count - 1),
            updated_at = now()
        WHERE user_id = $1 AND period = $2
        RETURNING ${usageColumns}
      `,
      [userId, period],
    );
    return result.rows[0] ?? null;
  }
}

function requireSingleRow<Row>(rows: Row[], message: string): Row {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
