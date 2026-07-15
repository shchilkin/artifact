import { runCli } from './cli.mjs';
import { commitsMatch } from './coolify.mjs';

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required environment variable: ${name}`);
  return normalized;
}

function positiveInteger(value, name, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function retryVerification(operation, { attempts, intervalMs, onRetry = () => {} }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      onRetry({ attempt, error, nextAttempt: attempt + 1 });
      await sleep(intervalMs);
    }
  }
  throw lastError;
}

async function readJson(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function assertHealthyApiResponse(response, body) {
  if (!response.ok) throw new Error(`Production API health check failed with ${response.status}`);
  if (body.ok !== true) throw new Error('Production API health response did not include ok=true');
}

function assertExpectedApiRevision(body, expectedSha) {
  if (commitsMatch(expectedSha, body.buildSha)) return;
  throw new Error(`API build ${body.buildSha ?? 'unknown'} does not match requested commit ${expectedSha}`);
}

function assertExpectedApiContract(body, expectedContractVersion) {
  if (body.contractVersion === expectedContractVersion) return;
  throw new Error(
    `API contract ${body.contractVersion ?? 'unknown'} does not match expected contract ${expectedContractVersion}`,
  );
}

export async function verifyProductionApi({ apiUrl, expectedContractVersion, expectedSha, fetchImpl = fetch }) {
  const healthUrl = new URL('/api/health', required(apiUrl, 'PRODUCTION_API_URL'));
  const response = await fetchImpl(healthUrl, { headers: { accept: 'application/json' } });
  const body = await readJson(response, 'Production API health check');
  assertHealthyApiResponse(response, body);
  assertExpectedApiRevision(body, expectedSha);
  assertExpectedApiContract(body, expectedContractVersion);
  return { buildSha: body.buildSha, contractVersion: body.contractVersion };
}

function assertSuccessfulWebResponse(response) {
  if (!response.ok) throw new Error(`Web deployment check failed with ${response.status}`);
}

function assertHtmlContentType(contentType) {
  if (!contentType.toLowerCase().includes('text/html')) {
    const receivedContentType = contentType ? contentType : 'missing';
    throw new Error(`Web deployment returned unexpected content type: ${receivedContentType}`);
  }
}

function assertNonemptyBody(body) {
  if (!body.trim()) throw new Error('Web deployment returned an empty HTML response');
}

function readWebBuildSha(body) {
  return body.match(/<meta\s+name=["']artifact-build-sha["']\s+content=["']([^"']+)["']/i)?.[1];
}

function assertExpectedWebRevision(body, expectedSha) {
  const buildSha = readWebBuildSha(body);
  if (commitsMatch(expectedSha, buildSha)) return buildSha;
  throw new Error(`Web build ${buildSha ?? 'unknown'} does not match requested commit ${expectedSha}`);
}

export async function verifyWebDeployment({ expectedSha, fetchImpl = fetch, webUrl }) {
  const response = await fetchImpl(required(webUrl, 'WEB_DEPLOYMENT_URL'), {
    headers: { accept: 'text/html' },
    redirect: 'follow',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();
  assertSuccessfulWebResponse(response);
  assertHtmlContentType(contentType);
  assertNonemptyBody(body);
  const buildSha = assertExpectedWebRevision(body, expectedSha);
  return { status: response.status, contentType, buildSha };
}

function createVerifier() {
  const attempts = positiveInteger(process.env.VERIFY_ATTEMPTS, 'VERIFY_ATTEMPTS', 12);
  const intervalMs = positiveInteger(process.env.VERIFY_INTERVAL_MS, 'VERIFY_INTERVAL_MS', 5_000);
  return (operation) =>
    retryVerification(operation, {
      attempts,
      intervalMs,
      onRetry: ({ nextAttempt, error }) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Verification attempt failed; retrying (${nextAttempt}/${attempts}): ${message}`);
      },
    });
}

async function verifyApiFromEnvironment(verify) {
  const expectedContractVersion = positiveInteger(
    required(process.env.EXPECTED_API_CONTRACT_VERSION, 'EXPECTED_API_CONTRACT_VERSION'),
    'EXPECTED_API_CONTRACT_VERSION',
  );
  const result = await verify(() =>
    verifyProductionApi({
      apiUrl: process.env.PRODUCTION_API_URL,
      expectedContractVersion,
      expectedSha: required(process.env.DEPLOY_SHA, 'DEPLOY_SHA'),
    }),
  );
  console.log(JSON.stringify({ event: 'production.api_verified', ...result }));
}

async function verifyWebFromEnvironment(verify) {
  const result = await verify(() =>
    verifyWebDeployment({
      expectedSha: required(process.env.DEPLOY_SHA, 'DEPLOY_SHA'),
      webUrl: process.env.WEB_DEPLOYMENT_URL,
    }),
  );
  console.log(JSON.stringify({ event: 'production.web_verified', ...result }));
}

async function main() {
  const target = process.env.VERIFY_TARGET ?? 'api';
  const targetVerifier = { api: verifyApiFromEnvironment, web: verifyWebFromEnvironment }[target];
  if (!targetVerifier) throw new Error(`Unknown VERIFY_TARGET: ${target}`);
  await targetVerifier(createVerifier());
}

runCli(import.meta.url, main);
