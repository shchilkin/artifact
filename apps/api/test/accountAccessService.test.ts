import { describe, expect, it } from 'vitest';
import { AccountAccessService } from '../src/accountAccessService.js';
import { InMemoryApiStore } from '../src/db/memory.js';

async function createTieredService(tier: 'free' | 'creator' | 'founder') {
  const store = new InMemoryApiStore();
  store.seedUser({ id: 'user-1' });
  store.seedUser({ id: 'admin-1', role: 'admin' });
  const repositories = store.repositories();
  await repositories.accountTiers.ensureAccess('user-1');
  if (tier !== 'free') {
    await repositories.accountTiers.assignTier({
      id: `assign-${tier}`,
      userId: 'user-1',
      expectedTier: 'free',
      expectedVersion: 0,
      newTier: tier,
      reason: 'Test setup',
      adminUserId: 'admin-1',
      idempotencyKey: `assign-${tier}`,
    });
  }
  let nextId = 0;
  return {
    repositories,
    service: new AccountAccessService(repositories, {
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      createId: () => `operation-${++nextId}`,
    }),
  };
}

describe('AccountAccessService', () => {
  it('denies provider AI for Free without creating an operation', async () => {
    const { repositories, service } = await createTieredService('free');

    await expect(
      service.reserve({ userId: 'user-1', feature: 'shader_create', idempotencyKey: 'shader-1' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'tier_ai_unavailable',
      allowance: { tier: 'free', limit: 0, remaining: 0 },
    });
    await expect(
      repositories.operations.findByIdempotencyKey('user-1', 'shader_create', 'shader-1'),
    ).resolves.toBeNull();
  });

  it('releases a failed Creator reservation and commits a successful one exactly once', async () => {
    const { service } = await createTieredService('creator');

    const first = await service.reserve({ userId: 'user-1', feature: 'shader_create', idempotencyKey: 'shader-1' });
    expect(first).toMatchObject({ ok: true, operation: { status: 'reserved' } });
    if (!first.ok) throw new Error('Expected a reservation.');
    await service.markRunning(first.operation.id);
    await service.release(first.operation.id, 'failed', 'provider_failed');
    await expect(service.getAllowance('user-1')).resolves.toMatchObject({ committed: 0, reserved: 0, remaining: 20 });

    const second = await service.reserve({ userId: 'user-1', feature: 'image_create', idempotencyKey: 'image-1' });
    expect(second).toMatchObject({ ok: true, operation: { status: 'reserved' } });
    if (!second.ok) throw new Error('Expected a reservation.');
    await service.markRunning(second.operation.id);
    await service.commit(second.operation.id);
    await service.commit(second.operation.id);

    await expect(service.getAllowance('user-1')).resolves.toMatchObject({ committed: 1, reserved: 0, remaining: 19 });
  });

  it('returns an idempotent operation without spending a second reservation', async () => {
    const { service } = await createTieredService('creator');
    const input = { userId: 'user-1', feature: 'shader_refine' as const, idempotencyKey: 'refine-1' };

    const first = await service.reserve(input);
    const retry = await service.reserve(input);

    expect(first).toMatchObject({ ok: true, claimed: true });
    expect(retry).toMatchObject({ ok: true, claimed: false });
    if (!first.ok || !retry.ok) throw new Error('Expected idempotent reservations.');
    expect(retry.operation.id).toBe(first.operation.id);
    await expect(service.getAllowance('user-1')).resolves.toMatchObject({ reserved: 1, remaining: 19 });
  });

  it('keeps Founder product allowance unbounded while tracking committed usage', async () => {
    const { service } = await createTieredService('founder');
    const reserved = await service.reserve({ userId: 'user-1', feature: 'image_create', idempotencyKey: 'image-1' });
    if (!reserved.ok) throw new Error('Expected a founder reservation.');

    await service.commit(reserved.operation.id);

    await expect(service.getAllowance('user-1')).resolves.toMatchObject({
      tier: 'founder',
      limit: null,
      committed: 1,
      reserved: 0,
      remaining: null,
    });
  });
});
