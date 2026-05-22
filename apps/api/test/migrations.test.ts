import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { ACTIVE_GENERATION_JOB_INDEX } from '../src/db/errors.js';

const testDatabaseUrl = process.env.API_TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');
const initialMigrationSql = readFileSync(resolve(migrationsDir, '001_initial_ai_generation.sql'), 'utf8');
const activeGuardMigrationSql = readFileSync(resolve(migrationsDir, '003_active_generation_guard.sql'), 'utf8');
const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl }) : null;

afterAll(async () => {
  await pool?.end();
});

describe('AI generation migrations', () => {
  it('keeps the active generation guard migration as a partial unique user index', () => {
    expect(activeGuardMigrationSql).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_GENERATION_JOB_INDEX}`);
    expect(activeGuardMigrationSql).toContain('ON ai_generation_jobs (user_id)');
    expect(activeGuardMigrationSql).toContain("WHERE status IN ('queued', 'running')");
    expect(activeGuardMigrationSql).toContain("status = 'expired'");
    expect(activeGuardMigrationSql).toContain("error_code = 'active_job_guard_migration_expired'");
  });
});

integrationDescribe('AI generation migration integration', () => {
  it('expires pre-existing duplicate active jobs before creating the active guard index', async () => {
    if (!pool) throw new Error('API_TEST_DATABASE_URL is required for this test.');

    const schema = `artifact_migration_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(initialMigrationSql);
      await client.query("INSERT INTO users (id, ai_enabled) VALUES ('user-1', true)");
      await client.query(`
        INSERT INTO ai_generation_jobs (id, user_id, provider, model, prompt, settings_json, idempotency_key, status)
        VALUES
          ('job-1', 'user-1', 'openai', 'gpt-image-2', 'first', '{}'::jsonb, 'idem-1', 'queued'),
          ('job-2', 'user-1', 'openai', 'gpt-image-2', 'second', '{}'::jsonb, 'idem-2', 'running')
      `);

      await expect(client.query(activeGuardMigrationSql)).resolves.toBeDefined();
      await expect(
        client.query<{ id: string; status: string; error_code: string | null }>(
          "SELECT id, status, error_code FROM ai_generation_jobs WHERE user_id = 'user-1' ORDER BY id",
        ),
      ).resolves.toMatchObject({
        rows: [
          { id: 'job-1', status: 'expired', error_code: 'active_job_guard_migration_expired' },
          { id: 'job-2', status: 'running', error_code: null },
        ],
      });
      await expect(
        client.query<{ indexname: string }>(
          'SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1',
          [ACTIVE_GENERATION_JOB_INDEX],
        ),
      ).resolves.toMatchObject({ rows: [{ indexname: ACTIVE_GENERATION_JOB_INDEX }] });
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });
});
