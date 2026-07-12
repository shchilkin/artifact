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
  it('claims a reserved operation with a per-feature idempotency guard', async () => {
    const client = createFakeQueryClient([[operation]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.claim({
        id: 'operation-1',
        userId: 'user-1',
        feature: 'shader_create',
        idempotencyKey: 'idem-1',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
      }),
    ).resolves.toEqual({ row: operation, claimed: true });

    expect(client.calls[0]?.sql).toContain('ON CONFLICT (user_id, feature, idempotency_key) DO NOTHING');
  });

  it('returns the winning operation after an idempotency conflict', async () => {
    const client = createFakeQueryClient([[], [operation]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.claim({
        id: 'operation-retry',
        userId: 'user-1',
        feature: 'shader_create',
        idempotencyKey: 'idem-1',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
      }),
    ).resolves.toEqual({ row: operation, claimed: false });
  });

  it('rejects an idempotency key reused with a different operation payload', async () => {
    const client = createFakeQueryClient([[], [operation]]);
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.claim({
        id: 'operation-conflict',
        userId: 'user-1',
        feature: 'shader_create',
        idempotencyKey: 'idem-1',
        reservationPeriod: '2026-08',
        reservedGenerations: 1,
      }),
    ).rejects.toThrow('Idempotency key reused with different AI operation input: idem-1');
  });

  it('maps the active-operation index to a domain error', async () => {
    const client: PostgresQueryClient = {
      query: async () => {
        throw Object.assign(new Error('duplicate active operation'), {
          code: '23505',
          constraint: ACTIVE_AI_OPERATION_INDEX,
        });
      },
    };
    const repository = new PostgresAiOperationRepository(client);

    await expect(
      repository.claim({
        id: 'operation-2',
        userId: 'user-1',
        feature: 'image_create',
        idempotencyKey: 'idem-2',
        reservationPeriod: '2026-07',
        reservedGenerations: 1,
      }),
    ).rejects.toBeInstanceOf(ActiveAiOperationExistsError);
  });
});
