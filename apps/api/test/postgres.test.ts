import { describe, expect, it, vi } from 'vitest';
import { createPostgresRepositories, type PostgresQueryClient } from '../src/db/postgres.js';

describe('createPostgresRepositories', () => {
  it('composes route repositories from one query client', async () => {
    const client: PostgresQueryClient = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const repositories = createPostgresRepositories(client);

    await expect(repositories.users.findById('user-1')).resolves.toBeNull();
    await expect(repositories.jobs.countActiveJobs('user-1')).resolves.toBe(0);
    await expect(repositories.shaderSpecs.findByIdempotencyKey('user-1', 'shader-1')).resolves.toBeNull();
    await expect(repositories.usage.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(0);

    expect(client.query).toHaveBeenCalledTimes(4);
  });
});
