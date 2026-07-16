import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  retryVerification,
  verifyProductionApi,
  verifyWebDeployment,
  verifyWebHtmlFile,
} from './verify-production.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('production deployment verification', () => {
  it('accepts an API with the requested build and contract', async () => {
    const result = await verifyProductionApi({
      apiUrl: 'https://api.example',
      expectedSha: SHA,
      expectedContractVersion: 1,
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true, buildSha: SHA, contractVersion: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    assert.deepEqual(result, { buildSha: SHA, contractVersion: 1 });
  });

  it('rejects a healthy but stale API', async () => {
    await assert.rejects(
      verifyProductionApi({
        apiUrl: 'https://api.example',
        expectedSha: SHA,
        expectedContractVersion: 1,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              ok: true,
              buildSha: 'fedcba9876543210fedcba9876543210fedcba98',
              contractVersion: 1,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      }),
      /API build .* does not match requested commit/,
    );
  });

  it('rejects an incompatible API contract', async () => {
    await assert.rejects(
      verifyProductionApi({
        apiUrl: 'https://api.example',
        expectedSha: SHA,
        expectedContractVersion: 2,
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: true, buildSha: SHA, contractVersion: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      }),
      /API contract 1 does not match expected contract 2/,
    );
  });

  it('accepts a nonblank HTML deployment', async () => {
    const result = await verifyWebDeployment({
      webUrl: 'https://staged.example',
      expectedSha: SHA,
      fetchImpl: async () =>
        new Response(
          `<!doctype html><html><head><meta name="artifact-build-sha" content="${SHA.slice(0, 12)}"></head><body>Artifact</body></html>`,
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        ),
    });

    assert.deepEqual(result, {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      buildSha: SHA.slice(0, 12),
    });
  });

  it('rejects a healthy web deployment from another revision', async () => {
    await assert.rejects(
      verifyWebDeployment({
        webUrl: 'https://staged.example',
        expectedSha: SHA,
        fetchImpl: async () =>
          new Response(
            '<!doctype html><html><head><meta name="artifact-build-sha" content="fedcba987654"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          ),
      }),
      /Web build .* does not match requested commit/,
    );
  });

  it('verifies authenticated staged HTML captured by vercel curl', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artifact-staged-web-'));
    const htmlPath = join(directory, 'index.html');
    try {
      await writeFile(
        htmlPath,
        `<!doctype html><html><head><meta name="artifact-build-sha" content="${SHA.slice(0, 12)}"></head></html>`,
      );

      assert.deepEqual(await verifyWebHtmlFile({ expectedSha: SHA, htmlPath }), {
        source: 'vercel-curl',
        buildSha: SHA.slice(0, 12),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('retries transient propagation failures before succeeding', async () => {
    let attempts = 0;
    const result = await retryVerification(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('revision is not visible yet');
        return 'ready';
      },
      { attempts: 3, intervalMs: 1 },
    );

    assert.equal(result, 'ready');
    assert.equal(attempts, 3);
  });

  it('returns the final propagation error after exhausting retries', async () => {
    await assert.rejects(
      retryVerification(async () => Promise.reject(new Error('still stale')), {
        attempts: 2,
        intervalMs: 1,
      }),
      /still stale/,
    );
  });
});
