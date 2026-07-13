import type {
  AiShaderRequestRepository,
  AiShaderRequestRow,
  ClaimAiShaderRequestInput,
  CompleteAiShaderRepairInput,
  CompleteAiShaderRequestInput,
  RejectAiShaderRequestInput,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const shaderColumns = `
  id,
  operation_id,
  user_id,
  idempotency_key,
  mode,
  prompt,
  parent_request_id,
  status,
  response_json,
  provider_request_id,
  provider_usage_json,
  error_status,
  error_code,
  error_message,
  compiler_diagnostic_json,
  repair_count,
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
          operation_id,
          user_id,
          idempotency_key,
          mode,
          prompt,
          parent_request_id,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING ${shaderColumns}
      `,
      [
        input.id,
        input.operationId ?? null,
        input.userId,
        input.idempotencyKey,
        input.mode,
        input.prompt,
        input.parentRequestId ?? null,
      ],
    );
    const inserted = result.rows[0];
    if (inserted) return { row: inserted, claimed: true };

    // Use a fresh statement snapshot after ON CONFLICT waited for the winning insert.
    const existing = await this.findByIdempotencyKey(input.userId, input.idempotencyKey);
    if (!existing) throw new Error(`Shader request conflict could not be read: ${input.id}`);
    return { row: existing, claimed: false };
  }

  async attachOperation(id: string, operationId: string): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `
        UPDATE ai_shader_requests
        SET operation_id = $2
        WHERE id = $1 AND (operation_id IS NULL OR operation_id = $2)
        RETURNING ${shaderColumns}
      `,
      [id, operationId],
    );
    return requireRow(result.rows, `Shader request operation could not be attached: ${id}`);
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

  async findByIdForUser(id: string, userId: string): Promise<AiShaderRequestRow | null> {
    const result = await this.client.query<AiShaderRequestRow>(
      `SELECT ${shaderColumns} FROM ai_shader_requests WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  async markGenerated(input: CompleteAiShaderRequestInput): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `
        UPDATE ai_shader_requests
        SET status = 'generated',
            response_json = $2::jsonb,
            provider_request_id = $3,
            provider_usage_json = $4::jsonb,
            completed_at = NULL
        WHERE id = $1 AND status = 'pending'
        RETURNING ${shaderColumns}
      `,
      [input.id, input.responseJson, input.providerRequestId ?? null, input.providerUsageJson ?? null],
    );
    return requireRow(result.rows, `Pending shader request not found: ${input.id}`);
  }

  async markAccepted(id: string, candidateRevision: number, completedAt: Date): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `UPDATE ai_shader_requests SET status = 'accepted', completed_at = $2
       WHERE id = $1 AND status = 'generated' AND repair_count = $3 RETURNING ${shaderColumns}`,
      [id, completedAt, candidateRevision],
    );
    return requireRow(result.rows, `Generated shader request not found: ${id}`);
  }

  async markClientRejected(input: RejectAiShaderRequestInput): Promise<AiShaderRequestRow> {
    const nextStatus = input.terminal ? 'failed' : 'client_rejected';
    const result = await this.client.query<AiShaderRequestRow>(
      `UPDATE ai_shader_requests
       SET status = $2, compiler_diagnostic_json = $3::jsonb,
           error_status = CASE WHEN $2 = 'failed' THEN 422 ELSE NULL END,
           error_code = CASE WHEN $2 = 'failed' THEN 'shader_browser_validation_failed' ELSE NULL END,
           error_message = CASE WHEN $2 = 'failed' THEN 'The repaired shader did not pass browser validation.' ELSE NULL END,
           completed_at = CASE WHEN $2 = 'failed' THEN $4 ELSE NULL END
       WHERE id = $1 AND status = 'generated' AND repair_count = $5 RETURNING ${shaderColumns}`,
      [input.id, nextStatus, input.diagnosticJson, input.completedAt, input.candidateRevision],
    );
    return requireRow(result.rows, `Generated shader request not found: ${input.id}`);
  }

  async beginRepair(id: string): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `UPDATE ai_shader_requests SET status = 'repairing', repair_count = repair_count + 1
       WHERE id = $1 AND status = 'client_rejected' AND repair_count = 0 RETURNING ${shaderColumns}`,
      [id],
    );
    return requireRow(result.rows, `Repairable shader request not found: ${id}`);
  }

  async completeRepair(input: CompleteAiShaderRepairInput): Promise<AiShaderRequestRow> {
    const result = await this.client.query<AiShaderRequestRow>(
      `UPDATE ai_shader_requests
       SET status = 'generated', response_json = $2::jsonb, provider_request_id = $3,
           provider_usage_json = COALESCE(provider_usage_json, '{}'::jsonb) || COALESCE($4::jsonb, '{}'::jsonb),
           completed_at = NULL
       WHERE id = $1 AND status = 'repairing' AND repair_count = 1 RETURNING ${shaderColumns}`,
      [input.id, input.responseJson, input.providerRequestId ?? null, input.providerUsageJson ?? null],
    );
    return requireRow(result.rows, `Repairing shader request not found: ${input.id}`);
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
        WHERE id = $1 AND status IN ('pending', 'repairing')
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
