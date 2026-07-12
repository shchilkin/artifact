import { describe, expect, it } from 'vitest';
import { PostgresUserRepository } from '../src/db/postgresUsers.js';
import type { UserRow } from '../src/db/types.js';
import { createFakeQueryClient } from './helpers/fakeQueryClient.js';

const user: UserRow = {
  id: 'user-1',
  email: 'me@example.com',
  role: 'user',
  ai_enabled: true,
  plus_status: 'none',
  created_at: new Date('2026-05-20T10:00:00.000Z'),
  updated_at: new Date('2026-05-20T10:00:00.000Z'),
  disabled_at: null,
};

describe('PostgresUserRepository', () => {
  it('finds users by id and returns null when no row is returned', async () => {
    const client = createFakeQueryClient([[user], []]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.findById('user-1')).resolves.toEqual(user);
    await expect(repository.findById('missing')).resolves.toBeNull();

    expect(client.calls.map((call) => call.values)).toEqual([['user-1'], ['missing']]);
    expect(client.calls[0]?.sql).toContain('FROM users');
    expect(client.calls[0]?.sql).toContain('WHERE id = $1');
  });

  it('finds users by email', async () => {
    const client = createFakeQueryClient([[user]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.findByEmail('me@example.com')).resolves.toEqual(user);

    expect(client.calls[0]?.values).toEqual(['me@example.com']);
    expect(client.calls[0]?.sql).toContain('WHERE email = $1');
  });

  it('creates users with repository defaults matching the contract', async () => {
    const client = createFakeQueryClient([[user]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.create({ id: 'user-1', email: 'me@example.com' })).resolves.toEqual(user);

    expect(client.calls[0]?.values).toEqual(['user-1', 'me@example.com', 'user', false, 'none']);
    expect(client.calls[0]?.sql).toContain('INSERT INTO users');
    expect(client.calls[0]?.sql).toContain('RETURNING');
  });

  it('upserts authenticated users without changing entitlements', async () => {
    const existing = { ...user, email: 'new@example.com', ai_enabled: true, plus_status: 'active' };
    const client = createFakeQueryClient([[existing]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.upsertFromAuth({ id: 'user-1', email: 'new@example.com' })).resolves.toEqual(existing);

    expect(client.calls[0]?.values).toEqual(['user-1', 'new@example.com']);
    expect(client.calls[0]?.sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(client.calls[0]?.sql).toContain('COALESCE(EXCLUDED.email, users.email)');
    expect(client.calls[0]?.sql).not.toContain('ai_enabled =');
  });

  it('can upsert authenticated users before email is known', async () => {
    const client = createFakeQueryClient([[{ ...user, email: null, ai_enabled: false }]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.upsertFromAuth({ id: 'user-1' })).resolves.toMatchObject({
      email: null,
      ai_enabled: false,
    });

    expect(client.calls[0]?.values).toEqual(['user-1', null]);
  });

  it('updates ai access and throws when the user is missing', async () => {
    const client = createFakeQueryClient([[{ ...user, ai_enabled: false }], []]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.setAiEnabled('user-1', false)).resolves.toMatchObject({ ai_enabled: false });
    await expect(repository.setAiEnabled('missing', true)).rejects.toThrow('User not found: missing');

    expect(client.calls.map((call) => call.values)).toEqual([
      ['user-1', false],
      ['missing', true],
    ]);
    expect(client.calls[0]?.sql).toContain('updated_at = now()');
  });

  it('assigns the server-managed Admin role by exact account id', async () => {
    const admin = { ...user, role: 'admin' };
    const client = createFakeQueryClient([[admin]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.setRole('user-1', 'admin')).resolves.toEqual(admin);

    expect(client.calls[0]?.values).toEqual(['user-1', 'admin']);
    expect(client.calls[0]?.sql).toContain('SET role = $2');
    expect(client.calls[0]?.sql).toContain('WHERE id = $1');
  });
});
