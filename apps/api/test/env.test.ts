import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadApiEnv } from '../src/env.js';

const touchedKeys = ['API_ENV_TEST_VALUE', 'API_ENV_TEST_LOCAL_VALUE', 'API_ENV_TEST_SHELL_VALUE'];

afterEach(() => {
  for (const key of touchedKeys) delete process.env[key];
});

describe('loadApiEnv', () => {
  it('loads .env and .env.local from the package cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'artifact-api-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'API_ENV_TEST_VALUE=from-env\n');
      writeFileSync(join(dir, '.env.local'), 'API_ENV_TEST_LOCAL_VALUE="from local"\n');

      loadApiEnv(dir);

      expect(process.env.API_ENV_TEST_VALUE).toBe('from-env');
      expect(process.env.API_ENV_TEST_LOCAL_VALUE).toBe('from local');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('does not override shell-provided environment variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'artifact-api-env-'));
    try {
      process.env.API_ENV_TEST_SHELL_VALUE = 'from-shell';
      writeFileSync(join(dir, '.env'), 'API_ENV_TEST_SHELL_VALUE=from-file\n');

      loadApiEnv(dir);

      expect(process.env.API_ENV_TEST_SHELL_VALUE).toBe('from-shell');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
