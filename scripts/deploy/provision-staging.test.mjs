import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { provisionStaging } from './provision-staging.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function options(overrides = {}) {
  return {
    apiUrl: 'https://api.staging.artifact.example',
    baseUrl: 'https://coolify.example',
    openAiApiKey: 'openai-secret',
    queueUrl: 'https://queues.staging.artifact.example',
    randomValue: () => 'generated-secret',
    templateApplicationUuid: 'production-app',
    token: 'coolify-secret',
    webUrl: 'https://artifact-staging.vercel.app',
    ...overrides,
  };
}

describe('provisionStaging', () => {
  it('creates a sibling application with an isolated environment and required variables', async () => {
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
      const path = new URL(url).pathname;
      const method = init.method ?? 'GET';
      requests.push({ path, method, body: init.body ? JSON.parse(init.body) : undefined });

      if (path.endsWith('/applications') && method === 'GET') return jsonResponse([]);
      if (path.endsWith('/applications/production-app')) {
        return jsonResponse({
          uuid: 'production-app',
          environment_id: 10,
          docker_compose_location: '/docker-compose.coolify.yml',
        });
      }
      if (path.endsWith('/projects')) return jsonResponse([{ uuid: 'project-1', name: 'Artifact' }]);
      if (path.endsWith('/projects/project-1/environments') && method === 'GET') {
        return jsonResponse([{ id: 10, uuid: 'production-env', name: 'production' }]);
      }
      if (path.endsWith('/projects/project-1/environments') && method === 'POST') {
        return jsonResponse({ uuid: 'staging-env', name: 'staging' }, 201);
      }
      if (path.endsWith('/servers')) return jsonResponse([{ uuid: 'server-1', name: 'VPS' }]);
      if (path.endsWith('/servers/server-1/resources')) {
        return jsonResponse([{ uuid: 'production-app', type: 'application' }]);
      }
      if (path.endsWith('/applications/public')) return jsonResponse({ uuid: 'staging-app' }, 201);
      if (path.endsWith('/applications/staging-app/envs') && method === 'GET') return jsonResponse([]);
      if (path.endsWith('/applications/staging-app/envs') && method === 'POST') return jsonResponse({}, 201);
      throw new Error(`Unexpected request: ${method} ${path}`);
    };

    const result = await provisionStaging(options({ fetchImpl }));

    assert.deepEqual(result, {
      applicationUuid: 'staging-app',
      created: true,
      environmentName: 'staging',
      projectUuid: 'project-1',
      serverUuid: 'server-1',
    });
    const create = requests.find((request) => request.path.endsWith('/applications/public'));
    assert.equal(create.body.environment_uuid, 'staging-env');
    assert.equal(create.body.git_branch, 'development');
    assert.equal(create.body.is_auto_deploy_enabled, false);
    assert.deepEqual(create.body.docker_compose_domains, [
      { name: 'api', domain: 'https://api.staging.artifact.example' },
      { name: 'bull-board', domain: 'https://queues.staging.artifact.example' },
    ]);
    const envBodies = requests
      .filter((request) => request.path.endsWith('/applications/staging-app/envs') && request.body)
      .map((request) => request.body);
    assert.ok(envBodies.some((variable) => variable.key === 'POSTGRES_PASSWORD'));
    assert.ok(envBodies.some((variable) => variable.key === 'OPENAI_API_KEY' && variable.value === 'openai-secret'));
    assert.ok(envBodies.every((variable) => variable.is_literal === true));
    assert.equal(envBodies.find((variable) => variable.key === 'ARTIFACT_BUILD_SHA').is_shown_once, false);
    assert.equal(envBodies.find((variable) => variable.key === 'OPENAI_API_KEY').is_shown_once, true);
  });

  it('reuses an existing staging application without rotating generated credentials', async () => {
    const requests = [];
    const generatedKeys = ['POSTGRES_PASSWORD', 'AUTH_JWT_SECRET', 'BETTER_AUTH_SECRET', 'BULL_BOARD_BASIC_AUTH_USERS'];
    const fetchImpl = async (url, init = {}) => {
      const path = new URL(url).pathname;
      const method = init.method ?? 'GET';
      requests.push({ path, method, body: init.body ? JSON.parse(init.body) : undefined });
      if (path.endsWith('/applications') && method === 'GET') {
        return jsonResponse([{ uuid: 'staging-app', name: 'artifact-staging' }]);
      }
      if (path.endsWith('/applications/staging-app/envs') && method === 'GET') {
        return jsonResponse([
          ...generatedKeys.map((key) => ({ key, is_preview: false })),
          { uuid: 'web-origin-env', key: 'WEB_ORIGIN', is_preview: false, is_shown_once: true },
          { uuid: 'openai-env', key: 'OPENAI_API_KEY', is_preview: false, is_shown_once: true },
        ]);
      }
      if (path.endsWith('/applications/staging-app/envs/web-origin-env') && method === 'DELETE') {
        return jsonResponse({ message: 'Environment variable deleted.' });
      }
      if (path.endsWith('/applications/staging-app/envs') && (method === 'POST' || method === 'PATCH')) {
        return jsonResponse({}, 201);
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    };

    const result = await provisionStaging(options({ fetchImpl }));

    assert.equal(result.created, false);
    const updatedKeys = requests.filter((request) => request.body?.key).map((request) => request.body.key);
    assert.ok(updatedKeys.includes('WEB_ORIGIN'));
    assert.ok(!updatedKeys.includes('OPENAI_API_KEY'));
    assert.ok(generatedKeys.every((key) => !updatedKeys.includes(key)));
    assert.ok(!requests.some((request) => request.path.endsWith('/applications/public')));
    assert.ok(
      requests.some(
        (request) =>
          request.path.endsWith('/applications/staging-app/envs/web-origin-env') && request.method === 'DELETE',
      ),
    );
  });
});
