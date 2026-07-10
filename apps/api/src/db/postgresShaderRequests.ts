import type {
  AiShaderRequestRepository,
  AiShaderRequestRow,
  ClaimAiShaderRequestInput,
  CompleteAiShaderRequestInput,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const shaderColumns = `
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

export class PostgresAiShaderRequestRepository implements AiShaderRequestRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async claim(input: ClaimAiShaderRequestInput): Promise<{ row: AiShaderRequestRow; claimed: boolean }> {
    const result = await this.client.query<AiShaderRequestRow>(
      `
        INSERT INTO ai_shader_requests (
          id,
          user_id,
          idempotency_key,
          mode,
          prompt,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING ${shaderColumns}
      `,
      [input.id, input.userId, input.idempotencyKey, input.mode, input.prompt],
    );
    const inserted = result.rows[0];
    if (inserted) return { row: inserted, claimed: true };

    // Use a fresh statement snapshot after ON CONFLICT waited for the winning insert.
    const existing = await this.findByIdempotencyKey(input.userId, input.idempotencyKey);
    if (!existing) throw new Error(`Shader request conflict could not be read: ${input.id}`);
    return { row: existing, claimed: false };
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiShaderRequestRow | null> {
    const result = await this.client.query<AiShaderRequestRow>(
      `
        SELECT ${shaderColumns}
        FROM ai_shader_requests
        WHERE user_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [userId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async complete(input: CompleteAiShaderRequestInput): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `
        UPDATE ai_shader_requests
        SET status = 'succeeded',
            response_json = $2::jsonb,
            provider_request_id = $3,
            provider_usage_json = $4::jsonb,
            completed_at = $5
        WHERE id = $1 AND status = 'pending'
        RETURNING ${shaderColumns}
      `,
      [
        input.id,
        input.responseJson,
        input.providerRequestId ?? null,
        input.providerUsageJson ?? null,
        input.completedAt,
      ],
    );
    return requireRow(result.rows, `Pending shader request not found: ${input.id}`);
  }

  async markFailed(
    id: string,
    error: { status: number; code: string; message: string; completedAt: Date },
  ): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `
        UPDATE ai_shader_requests
        SET status = 'failed',
            error_status = $2,
            error_code = $3,
            error_message = $4,
            completed_at = $5
        WHERE id = $1 AND status = 'pending'
        RETURNING ${shaderColumns}
      `,
      [id, error.status, error.code, error.message, error.completedAt],
    );
    return requireRow(result.rows, `Pending shader request not found: ${id}`);
  }
}

function requireRow<Row>(rows: readonly Row[], message: string): Row {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
