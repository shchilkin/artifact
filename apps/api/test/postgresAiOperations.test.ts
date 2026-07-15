import { describe, expect, it } from 'vitest';
import { ACTIVE_AI_OPERATION_INDEX, ActiveAiOperationExistsError } from '../src/db/errors.js';
import { PostgresAiOperationRepository, type PostgresQueryClient } from '../src/db/postgresAiOperations.js';
import type { AiOperationRow } from '../src/db/types.js';
import { createFakeQueryClient } from './helpers/fakeQueryClient.js';

const operation: AiOperationRow = {
  id: 'operation-1',
  user_id: 'user-1',
  feature: 'shader_create',
  status: 'reserved',
  idempotency_key: 'idem-1',
  reservation_period: '2026-07',
  reserved_generations: 1,
  error_code: null,
  created_at: new Date('2026-07-12T10:00:00.000Z'),
  started_at: null,
  completed_at: null,
};

describe('PostgresAiOperationRepository', () => {
  it('counts the same active statuses used by capacity reservation', async () => {
    const client = createFakeQueryClient([[{ count: '2' }]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(repository.countActiveForUser('user-1')).resolves.toBe(2);
    expect(client.calls[0]?.sql).toContain("status IN ('reserved', 'running')");
    expect(client.calls[0]?.values).toEqual(['user-1']);
  });

  it('claims a reserved operation with a per-feature idempotency guard', async () => {
    const client = createFakeQueryClient([[], [], [], [operation], []]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.reserve({
        id: 'operation-1',
        userId: 'user-1',
        feature: 'shader_create',
        idempotencyKey: 'idem-1',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
        generationLimit: 20,
        maxActiveOperations: 3,
      }),
    ).resolves.toEqual({ row: operation, claimed: true });

    expect(client.calls[1]?.sql).toBe('BEGIN');
    expect(client.calls[2]?.sql).toContain('pg_advisory_xact_lock');
    expect(client.calls[3]?.sql).toContain('INSERT INTO ai_usage_monthly');
    expect(client.calls[3]?.sql).toContain('committed_generation_count');
    expect(client.calls[4]?.sql).toBe('COMMIT');
  });

  it('returns the winning operation after an idempotency conflict', async () => {
    const client = createFakeQueryClient([[operation]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.reserve({
        id: 'operation-retry',
        userId: 'user-1',
        feature: 'shader_create',
        idempotencyKey: 'idem-1',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
        generationLimit: 20,
        maxActiveOperations: 3,
      }),
    ).resolves.toEqual({ row: operation, claimed: false });
  });

  it('rejects an idempotency key reused with a different operation payload', async () => {
    const client = createFakeQueryClient([[operation]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.reserve({
        id: 'operation-conflict',
        userId: 'user-1',
        feature: 'shader_create',
        idempotencyKey: 'idem-1',
        reservationPeriod: '2026-08',
        reservedGenerations: 1,
        generationLimit: 20,
        maxActiveOperations: 3,
      }),
    ).rejects.toThrow('Idempotency key reused with different AI operation input: idem-1');
  });

  it('maps the active-operation index to a domain error', async () => {
    let queryCount = 0;
    const client: PostgresQueryClient = {
      query: async () => {
        queryCount += 1;
        if (queryCount === 4) {
          throw Object.assign(new Error('duplicate active operation'), {
            code: '23505',
            constraint: ACTIVE_AI_OPERATION_INDEX,
          });
        }
        return { rows: [] };
      },
    };
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.reserve({
        id: 'operation-2',
        userId: 'user-1',
        feature: 'image_create',
        idempotencyKey: 'idem-2',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
        generationLimit: 20,
        maxActiveOperations: 3,
      }),
    ).rejects.toBeInstanceOf(ActiveAiOperationExistsError);
  });

  it('maps an exhausted tier operation limit to a domain error', async () => {
    const client = createFakeQueryClient([[], [], [], [{ reservation_result: 'active_limit_exhausted' }], [], []]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.reserve({
        id: 'operation-4',
        userId: 'user-1',
        feature: 'shader_refine',
        idempotencyKey: 'idem-4',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
        generationLimit: 20,
        maxActiveOperations: 3,
      }),
    ).rejects.toBeInstanceOf(ActiveAiOperationExistsError);

    expect(client.calls[2]?.sql).toContain('pg_advisory_xact_lock');
    expect(client.calls[3]?.sql).toContain("active_operation.status IN ('reserved', 'running')");
    expect(client.calls[3]?.values?.[7]).toBe(3);
    expect(client.calls[5]?.sql).toBe('ROLLBACK');
  });

  it('keeps cleanup terminal status when a late client release races expiry', async () => {
    const expiredOperation = {
      ...operation,
      status: 'expired' as const,
      error_code: 'operation_expired',
      completed_at: new Date('2026-07-12T16:00:00.000Z'),
    };
    const client = createFakeQueryClient([[], [expiredOperation]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.release({
        id: operation.id,
        status: 'failed',
        errorCode: 'shader_browser_validation_failed',
        completedAt: new Date('2026-07-12T16:01:00.000Z'),
      }),
    ).resolves.toEqual(expiredOperation);
  });
});
