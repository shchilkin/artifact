import {
  ActiveAiOperationExistsError,
  isActiveAiOperationUniqueViolation,
  isAiOperationIdempotencyUniqueViolation,
} from './errors.js';
import { assertOperationRetry } from './idempotencyInputs.js';
import type {
  AiOperationRepository,
  AiOperationRow,
  CreateAiOperationInput,
  ReleaseAiOperationInput,
  ReserveAiOperationInput,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

const operationColumns = `
  id,
  user_id,
  feature,
  status,
  idempotency_key,
  reservation_period,
  reserved_generations,
  error_code,
  created_at,
  started_at,
  completed_at
`;

export class PostgresAiOperationRepository implements AiOperationRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async findById(id: string): Promise<AiOperationRow | null> {
    const result = await this.client.query<AiOperationRow>(
      `SELECT ${operationColumns} FROM ai_operations WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByIdempotencyKey(
    userId: string,
    feature: CreateAiOperationInput['feature'],
    idempotencyKey: string,
  ): Promise<AiOperationRow | null> {
    const result = await this.client.query<AiOperationRow>(
      `
        SELECT ${operationColumns}
        FROM ai_operations
        WHERE user_id = $1 AND feature = $2 AND idempotency_key = $3
      `,
      [userId, feature, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async reserve(input: ReserveAiOperationInput): Promise<{ row: AiOperationRow; claimed: boolean } | null> {
    const existing = await this.findByIdempotencyKey(input.userId, input.feature, input.idempotencyKey);
    if (existing) {
      assertOperationRetry(existing, input);
      return { row: existing, claimed: false };
    }
    try {
      const result = await this.client.query<AiOperationRow>(
        `
          WITH reserved_usage AS (
            INSERT INTO ai_usage_monthly (
              user_id,
              period,
              generation_limit,
              generation_count,
              committed_generation_count,
              reserved_generation_count,
              estimated_cost
            )
            SELECT $2, $5, $7::integer, $6::integer, 0, $6::integer, 0
            WHERE $6::integer <= $7::integer
            ON CONFLICT (user_id, period)
            DO UPDATE SET
              generation_limit = EXCLUDED.generation_limit,
              generation_count = ai_usage_monthly.committed_generation_count
                + ai_usage_monthly.reserved_generation_count
                + EXCLUDED.reserved_generation_count,
              reserved_generation_count = ai_usage_monthly.reserved_generation_count
                + EXCLUDED.reserved_generation_count,
              updated_at = now()
            WHERE ai_usage_monthly.committed_generation_count
                + ai_usage_monthly.reserved_generation_count
                + EXCLUDED.reserved_generation_count <= EXCLUDED.generation_limit
            RETURNING user_id
          )
          INSERT INTO ai_operations (
            id,
            user_id,
            feature,
            status,
            idempotency_key,
            reservation_period,
            reserved_generations
          )
          SELECT $1, $2, $3, 'reserved', $4, $5, $6
          FROM reserved_usage
          RETURNING ${operationColumns}
        `,
        [
          input.id,
          input.userId,
          input.feature,
          input.idempotencyKey,
          input.reservationPeriod,
          input.reservedGenerations,
          positiveInteger(input.generationLimit, 'generationLimit'),
        ],
      );
      const row = result.rows[0];
      return row ? { row, claimed: true } : null;
    } catch (error) {
      if (isActiveAiOperationUniqueViolation(error)) {
        throw new ActiveAiOperationExistsError(input.userId, { cause: error });
      }
      if (isAiOperationIdempotencyUniqueViolation(error)) {
        const winner = await this.findByIdempotencyKey(input.userId, input.feature, input.idempotencyKey);
        if (!winner) throw error;
        assertOperationRetry(winner, input);
        return { row: winner, claimed: false };
      }
      throw error;
    }
  }

  async markRunning(id: string, startedAt: Date): Promise<AiOperationRow> {
    const result = await this.client.query<AiOperationRow>(
      `
        UPDATE ai_operations
        SET status = 'running', started_at = $2
        WHERE id = $1 AND status = 'reserved'
        RETURNING ${operationColumns}
      `,
      [id, startedAt],
    );
    return result.rows[0] ?? this.requireStatus(id, 'running');
  }

  async markSucceeded(id: string, completedAt: Date): Promise<AiOperationRow> {
    const result = await this.client.query<AiOperationRow>(
      `
        WITH transitioned AS (
          UPDATE ai_operations
          SET status = 'succeeded', completed_at = $2
          WHERE id = $1 AND status IN ('reserved', 'running')
          RETURNING ${operationColumns}
        ), usage_updated AS (
          UPDATE ai_usage_monthly AS usage
          SET committed_generation_count = usage.committed_generation_count + transitioned.reserved_generations,
              reserved_generation_count = GREATEST(
                0,
                usage.reserved_generation_count - transitioned.reserved_generations
              ),
              generation_count = usage.committed_generation_count
                + transitioned.reserved_generations
                + GREATEST(0, usage.reserved_generation_count - transitioned.reserved_generations),
              updated_at = $2
          FROM transitioned
          WHERE usage.user_id = transitioned.user_id
            AND usage.period = transitioned.reservation_period
          RETURNING usage.user_id
        )
        SELECT ${operationColumns}
        FROM transitioned
        WHERE EXISTS (SELECT 1 FROM usage_updated)
      `,
      [id, completedAt],
    );
    return result.rows[0] ?? this.requireStatus(id, 'succeeded');
  }

  async release(input: ReleaseAiOperationInput): Promise<AiOperationRow> {
    const result = await this.client.query<AiOperationRow>(
      `
        WITH transitioned AS (
          UPDATE ai_operations
          SET status = $2, error_code = $3, completed_at = $4
          WHERE id = $1 AND status IN ('reserved', 'running')
          RETURNING ${operationColumns}
        ), usage_updated AS (
          UPDATE ai_usage_monthly AS usage
          SET reserved_generation_count = GREATEST(
                0,
                usage.reserved_generation_count - transitioned.reserved_generations
              ),
              generation_count = usage.committed_generation_count
                + GREATEST(0, usage.reserved_generation_count - transitioned.reserved_generations),
              updated_at = $4
          FROM transitioned
          WHERE usage.user_id = transitioned.user_id
            AND usage.period = transitioned.reservation_period
          RETURNING usage.user_id
        )
        SELECT ${operationColumns}
        FROM transitioned
        WHERE EXISTS (SELECT 1 FROM usage_updated)
      `,
      [input.id, input.status, input.errorCode ?? null, input.completedAt],
    );
    return result.rows[0] ?? this.requireStatus(input.id, input.status);
  }

  private async requireStatus(id: string, status: AiOperationRow['status']): Promise<AiOperationRow> {
    const operation = await this.findById(id);
    if (!operation) throw new Error(`AI operation not found: ${id}`);
    if (operation.status !== status)
      throw new Error(`AI operation has status ${operation.status}, expected ${status}: ${id}`);
    return operation;
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}
