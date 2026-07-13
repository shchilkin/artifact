import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { ACTIVE_GENERATION_JOB_INDEX } from '../src/db/errors.js';

const execFileAsync = promisify(execFile);
const testDatabaseUrl = process.env.API_TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(apiDir, 'src/db/migrations');
const migrationFiles = [
  '001_initial_ai_generation.sql',
  '002_users_email_nullable.sql',
  '003_active_generation_guard.sql',
  '004_better_auth_cloud_projects.sql',
  '005_ai_shader_spec_requests.sql',
  '006_ai_shader_requests.sql',
  '007_ai_shader_validation_lifecycle.sql',
  '008_ai_shader_refinement.sql',
  '009_account_tiers_and_usage_foundation.sql',
  '010_backfill_ai_operation_accounting.sql',
];
const migrateScript = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/migrate.mjs'), 'utf8');
const initialMigrationSql = readFileSync(resolve(migrationsDir, '001_initial_ai_generation.sql'), 'utf8');
const activeGuardMigrationSql = readFileSync(resolve(migrationsDir, '003_active_generation_guard.sql'), 'utf8');
const betterAuthMigrationSql = readFileSync(resolve(migrationsDir, '004_better_auth_cloud_projects.sql'), 'utf8');
const shaderMigrationSql = readFileSync(resolve(migrationsDir, '005_ai_shader_spec_requests.sql'), 'utf8');
const shaderRenameMigrationSql = readFileSync(resolve(migrationsDir, '006_ai_shader_requests.sql'), 'utf8');
const shaderLifecycleMigrationSql = readFileSync(
  resolve(migrationsDir, '007_ai_shader_validation_lifecycle.sql'),
  'utf8',
);
const shaderRefinementMigrationSql = readFileSync(resolve(migrationsDir, '008_ai_shader_refinement.sql'), 'utf8');
const accountTierMigrationSql = readFileSync(
  resolve(migrationsDir, '009_account_tiers_and_usage_foundation.sql'),
  'utf8',
);
const operationAccountingBackfillSql = readFileSync(
  resolve(migrationsDir, '010_backfill_ai_operation_accounting.sql'),
  'utf8',
);
const pool = testDatabaseUrl ? new Pool({ connectionString: testDatabaseUrl }) : null;

afterAll(async () => {
  await pool?.end();
});

describe('AI generation migrations', () => {
  it('backfills legacy generation counts into committed operation accounting', () => {
    expect(operationAccountingBackfillSql).toContain('committed_generation_count');
    expect(operationAccountingBackfillSql).toContain('GREATEST(committed_generation_count, generation_count)');
    expect(operationAccountingBackfillSql).toContain('reserved_generation_count = 0');
  });
  it('tracks applied production migrations with checksums under an advisory lock', () => {
    expect(migrateScript).toContain('schema_migrations');
    expect(migrateScript).toContain('pg_advisory_lock');
    expect(migrateScript).toContain('checksum');
    expect(migrateScript).toContain("await client.query('BEGIN')");
    expect(migrateScript).toContain("await client.query('COMMIT')");
    expect(migrateScript).toContain("await client.query('ROLLBACK')");
    expect(migrateScript).toContain('already applied with a different checksum');
    expect(migrateScript).toContain('must not contain transaction control statements');
  });

  it('keeps SQL migration files free of transaction control statements', () => {
    for (const file of migrationFiles) {
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
      expect(sql).not.toMatch(/(^|\n)\s*(BEGIN|COMMIT|ROLLBACK)\s*;/iu);
    }
  });

  it('keeps the active generation guard migration as a partial unique user index', () => {
    expect(activeGuardMigrationSql).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_GENERATION_JOB_INDEX}`);
    expect(activeGuardMigrationSql).toContain('ON ai_generation_jobs (user_id)');
    expect(activeGuardMigrationSql).toContain("WHERE status IN ('queued', 'running')");
    expect(activeGuardMigrationSql).toContain("status = 'expired'");
    expect(activeGuardMigrationSql).toContain("error_code = 'active_job_guard_migration_expired'");
  });

  it('creates Better Auth and cloud project tables in the account migration', () => {
    expect(betterAuthMigrationSql).toContain('CREATE TABLE IF NOT EXISTS "user"');
    expect(betterAuthMigrationSql).toContain('CREATE TABLE IF NOT EXISTS "session"');
    expect(betterAuthMigrationSql).toContain('CREATE TABLE IF NOT EXISTS account');
    expect(betterAuthMigrationSql).toContain('CREATE TABLE IF NOT EXISTS verification');
    expect(betterAuthMigrationSql).toContain('CREATE TABLE IF NOT EXISTS cloud_projects');
  });

  it('stores shader requests with a per-user idempotency guard', () => {
    expect(shaderMigrationSql).toContain('CREATE TABLE IF NOT EXISTS ai_shader_spec_requests');
    expect(shaderMigrationSql).toContain('UNIQUE (user_id, idempotency_key)');
    expect(shaderMigrationSql).toContain("status IN ('pending', 'succeeded', 'failed')");
    expect(shaderRenameMigrationSql).toContain('RENAME TO ai_shader_requests');
    expect(shaderRenameMigrationSql).toContain('RENAME CONSTRAINT');
    expect(shaderLifecycleMigrationSql).toContain("'generated', 'client_rejected', 'repairing', 'accepted', 'failed'");
    expect(shaderLifecycleMigrationSql).toContain("SET status = 'accepted'");
    expect(shaderLifecycleMigrationSql).toContain('repair_count integer NOT NULL DEFAULT 0');
    expect(shaderLifecycleMigrationSql).toContain('repair_count <= 1');
    expect(shaderRefinementMigrationSql).toContain('parent_request_id text NULL');
    expect(shaderRefinementMigrationSql).toContain('REFERENCES ai_shader_requests(id) ON DELETE SET NULL');
  });

  it('creates the account tier, operation, usage, reconciliation, and admin audit foundation', () => {
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS account_access');
    expect(accountTierMigrationSql).toContain("tier IN ('free', 'creator', 'founder')");
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS tier_assignments');
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS quota_grants');
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS quota_grant_reversals');
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS ai_operations');
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS ai_usage_events');
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS provider_reconciliations');
    expect(accountTierMigrationSql).toContain('CREATE TABLE IF NOT EXISTS admin_audit_events');
    expect(accountTierMigrationSql).toContain('cost_micro_usd bigint');
    expect(accountTierMigrationSql).toContain('pricing_version text');
    expect(accountTierMigrationSql).toContain('INSERT INTO account_access (user_id, tier)');
    expect(accountTierMigrationSql).toContain("SELECT id, 'free'");
    expect(accountTierMigrationSql).not.toContain('prompt');
    expect(accountTierMigrationSql).not.toContain('shader_code');
  });
});

integrationDescribe('AI generation migration integration', () => {
  it('applies production migrations once and skips them on rerun', async () => {
    if (!pool || !testDatabaseUrl) throw new Error('API_TEST_DATABASE_URL is required for this test.');

    const schema = `artifact_runner_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);

      const migrationDatabaseUrl = databaseUrlWithSearchPath(testDatabaseUrl, schema);
      const migrationEnv = {
        ...process.env,
        DATABASE_URL: migrationDatabaseUrl,
        DB_MIGRATION_CONNECT_ATTEMPTS: '1',
      };

      const firstRun = await execFileAsync(process.execPath, ['scripts/migrate.mjs'], {
        cwd: apiDir,
        env: migrationEnv,
      });
      expect(firstRun.stdout).toContain('"applied":true');

      await expect(
        client.query<{ name: string }>(`SELECT name FROM ${schema}.schema_migrations ORDER BY name`),
      ).resolves.toMatchObject({ rows: migrationFiles.map((name) => ({ name })) });
      await expect(
        client.query<{ exists: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'user')",
          [schema],
        ),
      ).resolves.toMatchObject({ rows: [{ exists: true }] });

      const secondRun = await execFileAsync(process.execPath, ['scripts/migrate.mjs'], {
        cwd: apiDir,
        env: migrationEnv,
      });
      expect(secondRun.stdout).toContain('"applied":false');
      expect(secondRun.stdout).toContain('"reason":"already_applied"');
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });

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

function databaseUrlWithSearchPath(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
}
