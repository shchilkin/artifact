import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const requiredEnv = {
  AUTH_JWT_SECRET: 'secret',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('defaults to the in-memory database driver for local development', () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      databaseDriver: 'memory',
      databaseUrl: '',
    });
  });

  it('requires DATABASE_URL when Postgres is selected', () => {
    expect(() => loadConfig({ ...requiredEnv, API_DATABASE_DRIVER: 'postgres' })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('accepts Postgres configuration for the VPS runtime', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        API_DATABASE_DRIVER: 'postgres',
        DATABASE_URL: 'postgres://artifact:artifact@localhost:5432/artifact',
      }),
    ).toMatchObject({
      databaseDriver: 'postgres',
      databaseUrl: 'postgres://artifact:artifact@localhost:5432/artifact',
    });
  });
});
