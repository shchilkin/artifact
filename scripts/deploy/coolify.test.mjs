import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deployCoolifyApplication } from './coolify.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetchSequence(responses) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const next = responses.shift();
    assert.ok(next, `Unexpected request: ${init.method ?? 'GET'} ${url}`);
    return typeof next === 'function' ? next(url, init) : next;
  };
  return { fetchImpl, requests };
}

function successfulResponses({ envs = [], finalCommit = SHA, includeProgress = false } = {}) {
  const deploymentResponses = includeProgress
    ? [
        jsonResponse({ deployment_uuid: 'deploy-1', status: 'in_progress', commit: finalCommit }),
        jsonResponse({ deployment_uuid: 'deploy-1', status: 'finished', commit: finalCommit }),
      ]
    : [jsonResponse({ deployment_uuid: 'deploy-1', status: 'finished', commit: finalCommit })];

  return [
    jsonResponse({ uuid: 'app-1' }),
    jsonResponse(envs),
    jsonResponse({ uuid: 'env-1', key: 'ARTIFACT_BUILD_SHA', value: SHA }, 201),
    jsonResponse({ deployments: [{ resource_uuid: 'app-1', deployment_uuid: 'deploy-1' }] }),
    ...deploymentResponses,
  ];
}

describe('deployCoolifyApplication', () => {
  it('pins the application, updates build metadata, and waits for the exact commit', async () => {
    const { fetchImpl, requests } = createFetchSequence(
      successfulResponses({
        envs: [{ key: 'ARTIFACT_BUILD_SHA', value: 'old-sha', is_preview: false }],
        includeProgress: true,
      }),
    );

    const result = await deployCoolifyApplication({
      baseUrl: 'https://coolify.example/api/v1',
      branch: 'main',
      token: 'secret-token',
      applicationUuid: 'app-1',
      sha: SHA,
      fetchImpl,
      pollIntervalMs: 0,
    });

    assert.deepEqual(result, {
      applicationUuid: 'app-1',
      deploymentUuid: 'deploy-1',
      commit: SHA,
      status: 'finished',
    });
    assert.equal(requests[0].url, 'https://coolify.example/api/v1/applications/app-1');
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      git_branch: 'main',
      git_commit_sha: SHA,
      is_auto_deploy_enabled: false,
    });
    assert.equal(requests[2].init.method, 'PATCH');
    assert.equal(requests[3].url, 'https://coolify.example/api/v1/deploy?uuid=app-1&force=false');
    assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  });

  it('creates the build metadata variable when it does not exist', async () => {
    const { fetchImpl, requests } = createFetchSequence(successfulResponses());

    await deployCoolifyApplication({
      baseUrl: 'https://coolify.example',
      branch: 'main',
      token: 'secret-token',
      applicationUuid: 'app-1',
      sha: SHA,
      fetchImpl,
      pollIntervalMs: 0,
    });

    assert.equal(requests[2].url, 'https://coolify.example/api/v1/applications/app-1/envs');
    assert.equal(requests[2].init.method, 'POST');
  });

  it('recreates a locked build metadata variable before deployment', async () => {
    const { fetchImpl, requests } = createFetchSequence([
      jsonResponse({ uuid: 'app-1' }),
      jsonResponse([{ uuid: 'locked-env', key: 'ARTIFACT_BUILD_SHA', is_preview: false, is_shown_once: true }]),
      jsonResponse({ message: 'Environment variable deleted.' }),
      jsonResponse({ uuid: 'new-env' }, 201),
      jsonResponse({ deployments: [{ resource_uuid: 'app-1', deployment_uuid: 'deploy-1' }] }),
      jsonResponse({ deployment_uuid: 'deploy-1', status: 'finished', commit: SHA }),
    ]);

    await deployCoolifyApplication({
      baseUrl: 'https://coolify.example',
      branch: 'development',
      token: 'secret-token',
      applicationUuid: 'app-1',
      sha: SHA,
      fetchImpl,
      pollIntervalMs: 0,
    });

    assert.equal(requests[2].url, 'https://coolify.example/api/v1/applications/app-1/envs/locked-env');
    assert.equal(requests[2].init.method, 'DELETE');
    assert.equal(requests[3].init.method, 'POST');
    assert.equal(JSON.parse(requests[3].init.body).is_shown_once, false);
  });

  it('rejects a deployment that completed from another commit', async () => {
    const staleSha = 'fedcba9876543210fedcba9876543210fedcba98';
    const { fetchImpl } = createFetchSequence(successfulResponses({ finalCommit: staleSha }));

    await assert.rejects(
      deployCoolifyApplication({
        baseUrl: 'https://coolify.example',
        branch: 'main',
        token: 'secret-token',
        applicationUuid: 'app-1',
        sha: SHA,
        fetchImpl,
        pollIntervalMs: 0,
      }),
      /completed commit .* does not match requested commit/,
    );
  });

  it('surfaces terminal Coolify failures', async () => {
    const { fetchImpl } = createFetchSequence([
      jsonResponse({ uuid: 'app-1' }),
      jsonResponse([]),
      jsonResponse({ uuid: 'env-1' }, 201),
      jsonResponse({ deployments: [{ resource_uuid: 'app-1', deployment_uuid: 'deploy-1' }] }),
      jsonResponse({ deployment_uuid: 'deploy-1', status: 'failed', commit: SHA }),
    ]);

    await assert.rejects(
      deployCoolifyApplication({
        baseUrl: 'https://coolify.example',
        branch: 'main',
        token: 'secret-token',
        applicationUuid: 'app-1',
        sha: SHA,
        fetchImpl,
        pollIntervalMs: 0,
      }),
      /Coolify deployment deploy-1 ended with status failed/,
    );
  });
});
