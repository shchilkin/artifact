import { ActiveGenerationJobExistsError, isActiveGenerationJobUniqueViolation } from './errors.js';
import type {
  AiGenerationJobRepository,
  AiGenerationJobRow,
  CreateAiGenerationJobInput,
  DbNumeric,
  JsonObject,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const jobColumns = `
  id,
  user_id,
  provider,
  model,
  prompt,
  negative_prompt,
  settings_json,
  idempotency_key,
  status,
  output_asset_id,
  error_code,
  error_message,
  retryable,
  attempt_count,
  estimated_cost,
  provider_usage_json,
  created_at,
  queued_at,
  started_at,
  completed_at,
  cancelled_at,
  expires_at
`;

export class PostgresAiGenerationJobRepository implements AiGenerationJobRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async create(input: CreateAiGenerationJobInput): Promise<AiGenerationJobRow> {
    try {
      const result = await this.client.query<AiGenerationJobRow>(
        `
          INSERT INTO ai_generation_jobs (
            id,
            user_id,
            provider,
            model,
            prompt,
            negative_prompt,
            settings_json,
            idempotency_key,
            status,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'queued', $9)
          RETURNING ${jobColumns}
        `,
        [
          input.id,
          input.userId,
          input.provider,
          input.model,
          input.prompt,
          input.negativePrompt ?? null,
          input.settingsJson,
          input.idempotencyKey,
          input.expiresAt ?? null,
        ],
      );
      return requireRow(result.rows, `Generation job was not created: ${input.id}`);
    } catch (error) {
      if (isActiveGenerationJobUniqueViolation(error)) {
        throw new ActiveGenerationJobExistsError(input.userId);
      }
      throw error;
    }
  }

  async findByIdForUser(id: string, userId: string): Promise<AiGenerationJobRow | null> {
    const result = await this.client.query<AiGenerationJobRow>(
      `
        SELECT ${jobColumns}
        FROM ai_generation_jobs
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiGenerationJobRow | null> {
    const result = await this.client.query<AiGenerationJobRow>(
      `
        SELECT ${jobColumns}
        FROM ai_generation_jobs
        WHERE user_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [userId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async markRunning(id: string, startedAt: Date): Promise<AiGenerationJobRow> {
    const result = await this.client.query<AiGenerationJobRow>(
      `
        UPDATE ai_generation_jobs
        SET status = 'running',
            attempt_count = attempt_count + 1,
            started_at = $2
        WHERE id = $1
        RETURNING ${jobColumns}
      `,
      [id, startedAt],
    );
    return requireRow(result.rows, `Generation job not found: ${id}`);
  }

  async markSucceeded(id: string, outputAssetId: string, completedAt: Date): Promise<AiGenerationJobRow> {
    const result = await this.client.query<AiGenerationJobRow>(
      `
        UPDATE ai_generation_jobs
        SET status = 'succeeded',
            output_asset_id = $2,
            completed_at = $3
        WHERE id = $1
        RETURNING ${jobColumns}
      `,
      [id, outputAssetId, completedAt],
    );
    return requireRow(result.rows, `Generation job not found: ${id}`);
  }

  async markCancelled(id: string, cancelledAt: Date): Promise<AiGenerationJobRow> {
    const result = await this.client.query<AiGenerationJobRow>(
      `
        UPDATE ai_generation_jobs
        SET status = 'cancelled',
            cancelled_at = $2,
            completed_at = $2
        WHERE id = $1
        RETURNING ${jobColumns}
      `,
      [id, cancelledAt],
    );
    return requireRow(result.rows, `Generation job not found: ${id}`);
  }

  async markFailed(
    id: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
      providerUsageJson?: JsonObject | null;
      estimatedCost?: DbNumeric | null;
    },
  ): Promise<AiGenerationJobRow> {
    const result = await this.client.query<AiGenerationJobRow>(
      `
        UPDATE ai_generation_jobs
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            retryable = $4,
            provider_usage_json = $5::jsonb,
            estimated_cost = $6,
            completed_at = now()
        WHERE id = $1
        RETURNING ${jobColumns}
      `,
      [id, error.code, error.message, error.retryable, error.providerUsageJson ?? null, error.estimatedCost ?? null],
    );
    return requireRow(result.rows, `Generation job not found: ${id}`);
  }

  async countActiveJobs(userId: string): Promise<number> {
    const result = await this.client.query<{ count: string | number }>(
      `
        SELECT count(*) AS count
        FROM ai_generation_jobs
        WHERE user_id = $1 AND status IN ('queued', 'running')
      `,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

function requireRow<TRow>(rows: readonly TRow[], message: string): TRow {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
