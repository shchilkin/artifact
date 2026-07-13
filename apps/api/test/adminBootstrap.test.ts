import { describe, expect, it } from 'vitest';
import { bootstrapFirstAdmin } from '../src/adminBootstrap.js';
import { parseAdminBootstrapArgs } from '../src/adminBootstrapArgs.js';
import { InMemoryApiStore } from '../src/db/memory.js';

describe('Admin bootstrap', () => {
  it('parses exact-ID confirmation arguments', () => {
    expect(
      parseAdminBootstrapArgs(['--user-id', 'founder-account', '--confirm-user-id', 'founder-account', '--yes']),
    ).toEqual({ userId: 'founder-account', confirmedUserId: 'founder-account', confirmed: true });
  });

  it('requires exact account confirmation and explicit consent', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'founder-account', email: 'founder@example.com' });
    const repositories = store.repositories();

    await expect(
      bootstrapFirstAdmin({
        repositories,
        userId: 'founder-account',
        confirmedUserId: 'another-account',
        confirmed: true,
      }),
    ).rejects.toThrow('exactly match');
    await expect(
      bootstrapFirstAdmin({
        repositories,
        userId: 'founder-account',
        confirmedUserId: 'founder-account',
        confirmed: false,
      }),
    ).rejects.toThrow('--yes');
  });

  it('assigns Admin once and records an attributable audit event', async () => {
    const store = new InMemoryApiStore();
    store.seedUser({ id: 'founder-account', email: 'founder@example.com' });
    const repositories = store.repositories();
    const input = {
      repositories,
      userId: 'founder-account',
      confirmedUserId: 'founder-account',
      confirmed: true,
      createId: () => 'bootstrap-audit-1',
    };

    await expect(bootstrapFirstAdmin(input)).resolves.toMatchObject({
      changed: true,
      user: { role: 'admin' },
      audit: { id: 'bootstrap-audit-1', admin_user_id: 'founder-account', action: 'role.bootstrap_admin' },
    });
    await expect(bootstrapFirstAdmin(input)).resolves.toMatchObject({ changed: false, audit: null });
  });

  it('syncs a Better Auth account before assigning the first Admin', async () => {
    const store = new InMemoryApiStore();
    const repositories = store.repositories();

    await expect(
      bootstrapFirstAdmin({
        repositories,
        userId: 'auth-account',
        confirmedUserId: 'auth-account',
        confirmed: true,
        findAuthenticatedUser: async () => ({ id: 'auth-account', email: 'admin@example.com' }),
      }),
    ).resolves.toMatchObject({
      changed: true,
      user: { id: 'auth-account', email: 'admin@example.com', role: 'admin' },
    });
  });
});
