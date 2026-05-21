import { describe, expect, it } from 'vitest';
import { type PostgresQueryClient, PostgresUserRepository } from '../src/db/postgresUsers.js';
import type { UserRow } from '../src/db/types.js';

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

class FakeQueryClient implements PostgresQueryClient {
  readonly calls: QueryCall[] = [];

  constructor(private readonly results: unknown[][]) {}

  async query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }> {
    this.calls.push({ sql, values });
    return { rows: (this.results.shift() ?? []) as Row[] };
  }
}

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
    const client = new FakeQueryClient([[user], []]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.findById('user-1')).resolves.toEqual(user);
    await expect(repository.findById('missing')).resolves.toBeNull();

    expect(client.calls.map((call) => call.values)).toEqual([['user-1'], ['missing']]);
    expect(client.calls[0]?.sql).toContain('FROM users');
    expect(client.calls[0]?.sql).toContain('WHERE id = $1');
  });

  it('finds users by email', async () => {
    const client = new FakeQueryClient([[user]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.findByEmail('me@example.com')).resolves.toEqual(user);

    expect(client.calls[0]?.values).toEqual(['me@example.com']);
    expect(client.calls[0]?.sql).toContain('WHERE email = $1');
  });

  it('creates users with repository defaults matching the contract', async () => {
    const client = new FakeQueryClient([[user]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.create({ id: 'user-1', email: 'me@example.com' })).resolves.toEqual(user);

    expect(client.calls[0]?.values).toEqual(['user-1', 'me@example.com', 'user', false, 'none']);
    expect(client.calls[0]?.sql).toContain('INSERT INTO users');
    expect(client.calls[0]?.sql).toContain('RETURNING');
  });

  it('upserts authenticated users without changing entitlements', async () => {
    const existing = { ...user, email: 'new@example.com', ai_enabled: true, plus_status: 'active' };
    const client = new FakeQueryClient([[existing]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.upsertFromAuth({ id: 'user-1', email: 'new@example.com' })).resolves.toEqual(existing);

    expect(client.calls[0]?.values).toEqual(['user-1', 'new@example.com']);
    expect(client.calls[0]?.sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(client.calls[0]?.sql).toContain('COALESCE(EXCLUDED.email, users.email)');
    expect(client.calls[0]?.sql).not.toContain('ai_enabled =');
  });

  it('can upsert authenticated users before email is known', async () => {
    const client = new FakeQueryClient([[{ ...user, email: null, ai_enabled: false }]]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.upsertFromAuth({ id: 'user-1' })).resolves.toMatchObject({
      email: null,
      ai_enabled: false,
    });

    expect(client.calls[0]?.values).toEqual(['user-1', null]);
  });

  it('updates ai access and throws when the user is missing', async () => {
    const client = new FakeQueryClient([[{ ...user, ai_enabled: false }], []]);
    const repository = new PostgresUserRepository(client);

    await expect(repository.setAiEnabled('user-1', false)).resolves.toMatchObject({ ai_enabled: false });
    await expect(repository.setAiEnabled('missing', true)).rejects.toThrow('User not found: missing');

    expect(client.calls.map((call) => call.values)).toEqual([
      ['user-1', false],
      ['missing', true],
    ]);
    expect(client.calls[0]?.sql).toContain('updated_at = now()');
  });
});
