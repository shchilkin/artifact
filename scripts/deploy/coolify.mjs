import { appendFile } from 'node:fs/promises';
import { runCli } from './cli.mjs';

const SUCCESS_STATUSES = new Set(['finished']);
const FAILURE_STATUSES = new Set(['cancelled', 'failed']);
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required environment variable: ${name}`);
  return normalized;
}

function normalizeApiBaseUrl(baseUrl) {
  const url = new URL(required(baseUrl, 'COOLIFY_BASE_URL'));
  url.pathname = `${url.pathname.replace(/\/$/, '')}${url.pathname.endsWith('/api/v1') ? '' : '/api/v1'}/`;
  url.search = '';
  url.hash = '';
  return url;
}

function assertFullSha(sha) {
  const normalized = required(sha, 'DEPLOY_SHA');
  if (!FULL_SHA_PATTERN.test(normalized)) throw new Error('DEPLOY_SHA must be a full 40-character Git commit SHA');
  return normalized.toLowerCase();
}

export function commitsMatch(expected, actual) {
  if (typeof actual !== 'string' || actual.length < 7) return false;
  const normalizedExpected = expected.toLowerCase();
  const normalizedActual = actual.toLowerCase();
  return normalizedExpected === normalizedActual || normalizedExpected.startsWith(normalizedActual);
}

function parseJsonResponse(text, pathname) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Coolify returned non-JSON from ${pathname}: ${text.slice(0, 200)}`);
  }
}

function assertSuccessfulResponse(response, init, url, text) {
  if (response.ok) return;

  throw new Error(
    `Coolify ${init.method ?? 'GET'} ${url.pathname} failed with ${response.status}: ${text.slice(0, 300)}`,
  );
}

async function requestJson(fetchImpl, url, token, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  assertSuccessfulResponse(response, init, url, text);
  return parseJsonResponse(text, url.pathname);
}

async function upsertBuildSha({ apiBaseUrl, applicationUuid, fetchImpl, sha, token }) {
  const envUrl = new URL(`applications/${encodeURIComponent(applicationUuid)}/envs`, apiBaseUrl);
  const variables = await requestJson(fetchImpl, envUrl, token);
  if (!Array.isArray(variables)) throw new Error('Coolify environment list response must be an array');

  const payload = JSON.stringify({
    key: 'ARTIFACT_BUILD_SHA',
    value: sha,
    is_preview: false,
    is_literal: true,
  });
  const method = variables.some((variable) => variable?.key === 'ARTIFACT_BUILD_SHA' && variable?.is_preview !== true)
    ? 'PATCH'
    : 'POST';
  await requestJson(fetchImpl, envUrl, token, { method, body: payload });
}

function resolveCompletedDeployment(deployment, deploymentUuid) {
  const status = typeof deployment.status === 'string' ? deployment.status.toLowerCase() : '';
  if (SUCCESS_STATUSES.has(status)) return deployment;
  if (FAILURE_STATUSES.has(status)) {
    throw new Error(`Coolify deployment ${deploymentUuid} ended with status ${status}`);
  }
  return undefined;
}

async function waitForDeployment({ apiBaseUrl, deploymentUuid, fetchImpl, maxWaitMs, pollIntervalMs, sleep, token }) {
  const startedAt = Date.now();
  const deploymentUrl = new URL(`deployments/${encodeURIComponent(deploymentUuid)}`, apiBaseUrl);

  while (Date.now() - startedAt <= maxWaitMs) {
    const deployment = await requestJson(fetchImpl, deploymentUrl, token);
    const completed = resolveCompletedDeployment(deployment, deploymentUuid);
    if (completed) return completed;
    await sleep(pollIntervalMs);
  }

  throw new Error(`Coolify deployment ${deploymentUuid} did not finish within ${maxWaitMs}ms`);
}

async function pinApplicationRevision({ apiBaseUrl, applicationUuid, branch, fetchImpl, sha, token }) {
  const applicationUrl = new URL(`applications/${encodeURIComponent(applicationUuid)}`, apiBaseUrl);
  await requestJson(fetchImpl, applicationUrl, token, {
    method: 'PATCH',
    body: JSON.stringify({
      git_branch: branch,
      git_commit_sha: sha,
      is_auto_deploy_enabled: false,
    }),
  });
}

async function triggerDeployment({ apiBaseUrl, applicationUuid, fetchImpl, token }) {
  const triggerUrl = new URL('deploy', apiBaseUrl);
  triggerUrl.searchParams.set('uuid', applicationUuid);
  triggerUrl.searchParams.set('force', 'false');
  const trigger = await requestJson(fetchImpl, triggerUrl, token);
  const deployment = trigger.deployments?.find((candidate) => candidate?.resource_uuid === applicationUuid);
  const deploymentUuid = deployment?.deployment_uuid;
  if (typeof deploymentUuid !== 'string' || !deploymentUuid) {
    throw new Error(`Coolify did not return a deployment UUID for application ${applicationUuid}`);
  }
  return deploymentUuid;
}

function assertCompletedCommit(expectedSha, completed, deploymentUuid) {
  if (commitsMatch(expectedSha, completed.commit)) return;

  throw new Error(
    `Coolify deployment ${deploymentUuid} completed commit ${completed.commit ?? 'unknown'}, which does not match requested commit ${expectedSha}`,
  );
}

export async function deployCoolifyApplication({
  applicationUuid,
  baseUrl,
  branch,
  fetchImpl = fetch,
  maxWaitMs = 30 * 60_000,
  pollIntervalMs = 10_000,
  sha,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  token,
}) {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl);
  const normalizedBranch = required(branch, 'COOLIFY_GIT_BRANCH');
  const normalizedToken = required(token, 'COOLIFY_TOKEN');
  const normalizedUuid = required(applicationUuid, 'COOLIFY_APPLICATION_UUID');
  const normalizedSha = assertFullSha(sha);

  await pinApplicationRevision({
    apiBaseUrl,
    applicationUuid: normalizedUuid,
    branch: normalizedBranch,
    fetchImpl,
    sha: normalizedSha,
    token: normalizedToken,
  });
  await upsertBuildSha({
    apiBaseUrl,
    applicationUuid: normalizedUuid,
    fetchImpl,
    sha: normalizedSha,
    token: normalizedToken,
  });

  const deploymentUuid = await triggerDeployment({
    apiBaseUrl,
    applicationUuid: normalizedUuid,
    fetchImpl,
    token: normalizedToken,
  });

  const completed = await waitForDeployment({
    apiBaseUrl,
    deploymentUuid,
    fetchImpl,
    maxWaitMs,
    pollIntervalMs,
    sleep,
    token: normalizedToken,
  });
  assertCompletedCommit(normalizedSha, completed, deploymentUuid);

  return {
    applicationUuid: normalizedUuid,
    deploymentUuid,
    commit: completed.commit,
    status: completed.status,
  };
}

async function writeGitHubOutputs(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await appendFile(
    outputPath,
    `application-uuid=${result.applicationUuid}\ndeployment-uuid=${result.deploymentUuid}\ncommit=${result.commit}\nstatus=${result.status}\n`,
  );
}

async function main() {
  const result = await deployCoolifyApplication({
    applicationUuid: process.env.COOLIFY_APPLICATION_UUID,
    baseUrl: process.env.COOLIFY_BASE_URL,
    branch: process.env.COOLIFY_GIT_BRANCH,
    sha: process.env.DEPLOY_SHA,
    token: process.env.COOLIFY_TOKEN,
  });
  await writeGitHubOutputs(result);
  console.log(JSON.stringify({ event: 'coolify.deployment_complete', ...result }));
}

runCli(import.meta.url, main);
