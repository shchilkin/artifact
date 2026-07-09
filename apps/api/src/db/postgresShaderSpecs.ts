import type {
  AiShaderSpecRequestRepository,
  AiShaderSpecRequestRow,
  ClaimAiShaderSpecRequestInput,
  CompleteAiShaderSpecRequestInput,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const shaderSpecColumns = `
  id,
  user_id,
  idempotency_key,
  mode,
  prompt,
  status,
  response_json,
  provider_request_id,
  provider_usage_json,
  error_status,
  error_code,
  error_message,
  created_at,
  completed_at
`;

export class PostgresAiShaderSpecRequestRepository implements AiShaderSpecRequestRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async claim(input: ClaimAiShaderSpecRequestInput): Promise<{ row: AiShaderSpecRequestRow; claimed: boolean }> {
    const result = await this.client.query<AiShaderSpecRequestRow>(
      `
        INSERT INTO ai_shader_spec_requests (
          id,
          user_id,
          idempotency_key,
          mode,
          prompt,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING ${shaderSpecColumns}
      `,
      [input.id, input.userId, input.idempotencyKey, input.mode, input.prompt],
    );
    const inserted = result.rows[0];
    if (inserted) return { row: inserted, claimed: true };

    // Use a fresh statement snapshot after ON CONFLICT waited for the winning insert.
    const existing = await this.findByIdempotencyKey(input.userId, input.idempotencyKey);
    if (!existing) throw new Error(`Shader spec request conflict could not be read: ${input.id}`);
    return { row: existing, claimed: false };
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiShaderSpecRequestRow | null> {
    const result = await this.client.query<AiShaderSpecRequestRow>(
      `
        SELECT ${shaderSpecColumns}
        FROM ai_shader_spec_requests
        WHERE user_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [userId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async complete(input: CompleteAiShaderSpecRequestInput): Promise<AiShaderSpecRequestRow> {
    const usagePeriod = input.usage?.period ?? null;
    const generationLimit = input.usage?.generationLimit ?? null;
    const result = await this.client.query<AiShaderSpecRequestRow>(
      `
        WITH completed AS (
          UPDATE ai_shader_spec_requests
          SET status = 'succeeded',
              response_json = $2::jsonb,
              provider_request_id = $3,
              provider_usage_json = $4::jsonb,
              completed_at = $5
          WHERE id = $1 AND status = 'pending'
          RETURNING ${shaderSpecColumns}
        ), usage_update AS (
          INSERT INTO ai_usage_monthly (
            user_id,
            period,
            generation_limit,
            generation_count,
            estimated_cost
          )
          SELECT user_id, $6::text, $7::integer, 1, 0
          FROM completed
          WHERE $6::text IS NOT NULL
          ON CONFLICT (user_id, period)
          DO UPDATE SET
            generation_limit = EXCLUDED.generation_limit,
            generation_count = ai_usage_monthly.generation_count + 1,
            updated_at = now()
          RETURNING user_id
        )
        SELECT completed.*
        FROM completed
        LEFT JOIN usage_update ON usage_update.user_id = completed.user_id
      `,
      [
        input.id,
        input.responseJson,
        input.providerRequestId ?? null,
        input.providerUsageJson ?? null,
        input.completedAt,
        usagePeriod,
        generationLimit,
      ],
    );
    return requireRow(result.rows, `Pending shader spec request not found: ${input.id}`);
  }

  async markFailed(
    id: string,
    error: { status: number; code: string; message: string; completedAt: Date },
  ): Promise<AiShaderSpecRequestRow> {
    const result = await this.client.query<AiShaderSpecRequestRow>(
      `
        UPDATE ai_shader_spec_requests
        SET status = 'failed',
            error_status = $2,
            error_code = $3,
            error_message = $4,
            completed_at = $5
        WHERE id = $1 AND status = 'pending'
        RETURNING ${shaderSpecColumns}
      `,
      [id, error.status, error.code, error.message, error.completedAt],
    );
    return requireRow(result.rows, `Pending shader spec request not found: ${id}`);
  }
}

function requireRow<Row>(rows: readonly Row[], message: string): Row {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
