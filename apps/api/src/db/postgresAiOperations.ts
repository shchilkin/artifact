import {
  ActiveAiOperationExistsError,
  isActiveAiOperationUniqueViolation,
  isAiOperationIdempotencyUniqueViolation,
} from './errors.js';
import { assertOperationRetry } from './idempotencyInputs.js';
import type {
  AiOperationReconciliationResult,
  AiOperationRepository,
  AiOperationRow,
  CreateAiOperationInput,
  ReconcileAiOperationsInput,
  ReleaseAiOperationInput,
  ReserveAiOperationInput,
} from './types.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

interface PostgresDedicatedClient extends PostgresQueryClient {
  release?: () => void;
}

interface PostgresConnectionProvider extends PostgresQueryClient {
  connect(): Promise<PostgresDedicatedClient>;
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

type ReservationQueryRow = Partial<AiOperationRow> & {
  reservation_result?: 'reserved' | 'active_limit_exhausted' | 'allowance_exhausted';
};

export class PostgresAiOperationRepository implements AiOperationRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async findById(id: string): Promise<AiOperationRow | null> {
    const result = await this.client.query<AiOperationRow>(
      `SELECT ${operationColumns} FROM ai_operations WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async countActiveForUser(userId: string): Promise<number> {
    const result = await this.client.query<{ count: string | number }>(
      `
        SELECT COUNT(*) AS count
        FROM ai_operations
        WHERE user_id = $1 AND status IN ('reserved', 'running')
      `,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
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
    const transaction = await acquireTransactionClient(this.client);
    let transactionOpen = false;
    try {
      await transaction.client.query('BEGIN');
      transactionOpen = true;
      await transaction.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [input.userId]);
      const result = await transaction.client.query<ReservationQueryRow>(
        `
          WITH active_capacity AS MATERIALIZED (
            SELECT COUNT(active_operation.id) < $8::integer AS available
            FROM ai_operations AS active_operation
            WHERE active_operation.user_id = $2
              AND active_operation.status IN ('reserved', 'running')
          ), reserved_usage AS (
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
            FROM active_capacity
            WHERE active_capacity.available
              AND $6::integer <= $7::integer
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
          ), inserted AS (
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
          )
          SELECT
            inserted.*,
            CASE
              WHEN inserted.id IS NOT NULL THEN 'reserved'
              WHEN active_capacity.available THEN 'allowance_exhausted'
              ELSE 'active_limit_exhausted'
            END AS reservation_result
          FROM active_capacity
          LEFT JOIN inserted ON true
        `,
        [
          input.id,
          input.userId,
          input.feature,
          input.idempotencyKey,
          input.reservationPeriod,
          input.reservedGenerations,
          positiveInteger(input.generationLimit, 'generationLimit'),
          nonNegativeInteger(input.maxActiveOperations, 'maxActiveOperations'),
        ],
      );
      const resultRow = result.rows[0];
      if (resultRow?.id) {
        const row = { ...resultRow };
        delete row.reservation_result;
        await transaction.client.query('COMMIT');
        transactionOpen = false;
        return { row: row as AiOperationRow, claimed: true };
      }
      const winner = await findByIdempotencyKey(transaction.client, input.userId, input.feature, input.idempotencyKey);
      if (winner) {
        assertOperationRetry(winner, input);
        await transaction.client.query('COMMIT');
        transactionOpen = false;
        return { row: winner, claimed: false };
      }
      if (resultRow?.reservation_result === 'active_limit_exhausted') {
        throw new ActiveAiOperationExistsError(input.userId);
      }
      await transaction.client.query('COMMIT');
      transactionOpen = false;
      return null;
    } catch (error) {
      if (transactionOpen) {
        await transaction.client.query('ROLLBACK');
      }
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
    } finally {
      transaction.release();
    }
  }

  async markRunning(id: string, startedAt: Date): Promise<AiOperationRow> {
    const result = await this.client.query<AiOperationRow>(
      `
        UPDATE ai_operations
        SET status = 'running', started_at = $2
        WHERE id = $1 AND status IN ('reserved', 'awaiting_validation')
        RETURNING ${operationColumns}
      `,
      [id, startedAt],
    );
    return result.rows[0] ?? this.requireStatus(id, 'running');
  }

  async markAwaitingValidation(id: string): Promise<AiOperationRow> {
    const result = await this.client.query<AiOperationRow>(
      `
        UPDATE ai_operations
        SET status = 'awaiting_validation'
        WHERE id = $1 AND status = 'running'
        RETURNING ${operationColumns}
      `,
      [id],
    );
    return result.rows[0] ?? this.requireStatus(id, 'awaiting_validation');
  }

  async markSucceeded(id: string, completedAt: Date): Promise<AiOperationRow> {
    const result = await this.client.query<AiOperationRow>(
      `
        WITH transitioned AS (
          UPDATE ai_operations
          SET status = 'succeeded', completed_at = $2
          WHERE id = $1 AND status IN ('reserved', 'running', 'awaiting_validation')
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
          WHERE id = $1 AND status IN ('reserved', 'running', 'awaiting_validation')
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
    const transitioned = result.rows[0];
    if (transitioned) return transitioned;
    const operation = await this.findById(input.id);
    if (!operation) throw new Error(`AI operation not found: ${input.id}`);
    if (isTerminalStatus(operation.status)) return operation;
    throw new Error(`AI operation has status ${operation.status}, expected ${input.status}: ${input.id}`);
  }

  async reconcile(input: ReconcileAiOperationsInput): Promise<AiOperationReconciliationResult> {
    const recoveredOperationIds = input.dryRun
      ? await this.selectRecoverableOperationIds(input.limit)
      : await this.recoverUsableOperations(input.now, input.limit);
    const expiredOperationIds = input.dryRun
      ? await this.selectExpirableOperationIds(input.staleBefore, input.limit)
      : await this.expireStaleOperations(input.staleBefore, input.now, input.limit);
    return { recoveredOperationIds, expiredOperationIds };
  }

  private async selectRecoverableOperationIds(limit: number) {
    const result = await this.client.query<{ id: string }>(
      `
        SELECT operations.id
        FROM ai_operations AS operations
        WHERE operations.status IN ('reserved', 'running', 'awaiting_validation')
          AND ${usableResultExistsSql('operations')}
        ORDER BY operations.created_at ASC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  private async recoverUsableOperations(now: Date, limit: number) {
    const result = await this.client.query<{ id: string }>(
      `
        WITH transitioned AS (
          UPDATE ai_operations AS operations
          SET status = 'succeeded', completed_at = $1
          WHERE operations.id IN (
            SELECT candidates.id
            FROM ai_operations AS candidates
            WHERE candidates.status IN ('reserved', 'running', 'awaiting_validation')
              AND ${usableResultExistsSql('candidates')}
            ORDER BY candidates.created_at ASC
            LIMIT $2
          )
            AND operations.status IN ('reserved', 'running', 'awaiting_validation')
          RETURNING operations.id, operations.user_id, operations.reservation_period, operations.reserved_generations
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
              updated_at = $1
          FROM transitioned
          WHERE usage.user_id = transitioned.user_id
            AND usage.period = transitioned.reservation_period
          RETURNING usage.user_id
        )
        SELECT id FROM transitioned
      `,
      [now, limit],
    );
    return result.rows.map((row) => row.id);
  }

  private async selectExpirableOperationIds(staleBefore: Date, limit: number) {
    const result = await this.client.query<{ id: string }>(
      `
        SELECT operations.id
        FROM ai_operations AS operations
        WHERE operations.status IN ('reserved', 'running', 'awaiting_validation')
          AND COALESCE(operations.started_at, operations.created_at) < $1
          AND NOT ${usableResultExistsSql('operations')}
        ORDER BY COALESCE(operations.started_at, operations.created_at) ASC
        LIMIT $2
      `,
      [staleBefore, limit],
    );
    return result.rows.map((row) => row.id);
  }

  private async expireStaleOperations(staleBefore: Date, now: Date, limit: number) {
    const result = await this.client.query<{ id: string }>(
      `
        WITH transitioned AS (
          UPDATE ai_operations AS operations
          SET status = 'expired',
              error_code = COALESCE(operations.error_code, 'operation_expired'),
              completed_at = $2
          WHERE operations.id IN (
            SELECT candidates.id
            FROM ai_operations AS candidates
            WHERE candidates.status IN ('reserved', 'running', 'awaiting_validation')
              AND COALESCE(candidates.started_at, candidates.created_at) < $1
              AND NOT ${usableResultExistsSql('candidates')}
            ORDER BY COALESCE(candidates.started_at, candidates.created_at) ASC
            LIMIT $3
          )
            AND operations.status IN ('reserved', 'running', 'awaiting_validation')
          RETURNING operations.id, operations.user_id, operations.reservation_period, operations.reserved_generations
        ), usage_updated AS (
          UPDATE ai_usage_monthly AS usage
          SET reserved_generation_count = GREATEST(
                0,
                usage.reserved_generation_count - transitioned.reserved_generations
              ),
              generation_count = usage.committed_generation_count
                + GREATEST(0, usage.reserved_generation_count - transitioned.reserved_generations),
              updated_at = $2
          FROM transitioned
          WHERE usage.user_id = transitioned.user_id
            AND usage.period = transitioned.reservation_period
          RETURNING usage.user_id
        ), jobs_expired AS (
          UPDATE ai_generation_jobs AS jobs
          SET status = 'expired',
              error_code = COALESCE(jobs.error_code, 'operation_expired'),
              error_message = COALESCE(jobs.error_message, 'Generation operation expired during cleanup.'),
              retryable = false,
              completed_at = $2
          FROM transitioned
          WHERE jobs.operation_id = transitioned.id
            AND jobs.status IN ('queued', 'running')
          RETURNING jobs.id
        ), shaders_failed AS (
          UPDATE ai_shader_requests AS shaders
          SET status = 'failed',
              error_status = 504,
              error_code = COALESCE(shaders.error_code, 'operation_expired'),
              error_message = COALESCE(shaders.error_message, 'Shader operation expired before completion.'),
              completed_at = $2
          FROM transitioned
          WHERE shaders.operation_id = transitioned.id
            AND shaders.status IN ('pending', 'generated', 'client_rejected', 'repairing')
          RETURNING shaders.id
        )
        SELECT id FROM transitioned
      `,
      [staleBefore, now, limit],
    );
    return result.rows.map((row) => row.id);
  }

  private async requireStatus(id: string, status: AiOperationRow['status']): Promise<AiOperationRow> {
    const operation = await this.findById(id);
    if (!operation) throw new Error(`AI operation not found: ${id}`);
    if (operation.status !== status)
      throw new Error(`AI operation has status ${operation.status}, expected ${status}: ${id}`);
    return operation;
  }
}

function usableResultExistsSql(operationAlias: string) {
  return `(
    EXISTS (
      SELECT 1 FROM ai_generation_jobs AS jobs
      WHERE jobs.operation_id = ${operationAlias}.id
        AND jobs.status = 'succeeded'
        AND jobs.output_asset_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM ai_shader_requests AS shaders
      WHERE shaders.operation_id = ${operationAlias}.id
        AND shaders.status = 'accepted'
        AND shaders.response_json IS NOT NULL
    )
  )`;
}

function isTerminalStatus(status: AiOperationRow['status']) {
  return ['succeeded', 'failed', 'cancelled', 'expired'].includes(status);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

async function findByIdempotencyKey(
  client: PostgresQueryClient,
  userId: string,
  feature: CreateAiOperationInput['feature'],
  idempotencyKey: string,
) {
  const result = await client.query<AiOperationRow>(
    `
      SELECT ${operationColumns}
      FROM ai_operations
      WHERE user_id = $1 AND feature = $2 AND idempotency_key = $3
    `,
    [userId, feature, idempotencyKey],
  );
  return result.rows[0] ?? null;
}

async function acquireTransactionClient(client: PostgresQueryClient) {
  if (isPoolConnectionProvider(client)) {
    const dedicated = await client.connect();
    return { client: dedicated, release: () => dedicated.release?.() };
  }
  return { client, release: () => undefined };
}

function isPoolConnectionProvider(client: PostgresQueryClient): client is PostgresConnectionProvider {
  const candidate = client as PostgresQueryClient & {
    connect?: unknown;
    idleCount?: unknown;
    totalCount?: unknown;
    waitingCount?: unknown;
  };
  return (
    typeof candidate.connect === 'function' &&
    typeof candidate.idleCount === 'number' &&
    typeof candidate.totalCount === 'number' &&
    typeof candidate.waitingCount === 'number'
  );
}
