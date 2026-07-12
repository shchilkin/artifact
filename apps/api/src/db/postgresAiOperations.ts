import { ActiveAiOperationExistsError, isActiveAiOperationUniqueViolation } from './errors.js';
import { assertOperationRetry } from './idempotencyInputs.js';
import type { AiOperationRepository, AiOperationRow, CreateAiOperationInput } from './types.js';

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

  async claim(input: CreateAiOperationInput): Promise<{ row: AiOperationRow; claimed: boolean }> {
    try {
      const result = await this.client.query<AiOperationRow>(
        `
          INSERT INTO ai_operations (
            id,
            user_id,
            feature,
            status,
            idempotency_key,
            reservation_period,
            reserved_generations
          )
          VALUES ($1, $2, $3, 'reserved', $4, $5, $6)
          ON CONFLICT (user_id, feature, idempotency_key) DO NOTHING
          RETURNING ${operationColumns}
        `,
        [
          input.id,
          input.userId,
          input.feature,
          input.idempotencyKey,
          input.reservationPeriod,
          input.reservedGenerations,
        ],
      );
      const claimed = result.rows[0];
      if (claimed) return { row: claimed, claimed: true };
      const existing = await this.findByIdempotencyKey(input.userId, input.feature, input.idempotencyKey);
      if (!existing)
        throw new Error(`AI operation idempotency winner not found: ${input.userId}:${input.idempotencyKey}`);
      assertOperationRetry(existing, input);
      return { row: existing, claimed: false };
    } catch (error) {
      if (isActiveAiOperationUniqueViolation(error)) throw new ActiveAiOperationExistsError(input.userId);
      throw error;
    }
  }
}
