const baseUrl = process.env.API_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const token = process.env.API_SMOKE_TOKEN ?? process.env.API_DEV_BEARER_TOKEN ?? 'dev-token';
const provider = process.env.API_SMOKE_PROVIDER ?? 'openai';
const timeoutMs = Number(process.env.API_SMOKE_TIMEOUT_MS ?? 30_000);

function log(step, details = {}) {
  console.log(JSON.stringify({ step, ...details }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON from ${response.url}, received: ${text.slice(0, 200)}`);
  }
}

async function requestJson(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: requestHeaders(init),
  });
  const body = await readJson(response);
  if (!response.ok) throw smokeRequestError(path, init, response, body);
  return body;
}

function requestHeaders(init) {
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(init.body ? { 'content-type': 'application/json' } : {}),
    ...init.headers,
  };
}

function smokeRequestError(path, init, response, body) {
  if (apiHealthNotFound(path, response, body)) return apiHealthNotFoundError(path);
  return new Error(`${init.method ?? 'GET'} ${path} failed with ${response.status}: ${JSON.stringify(body)}`);
}

function apiHealthNotFound(path, response, body) {
  return path === '/api/health' && response.status === 404 && body?.code === 'not_found';
}

function apiHealthNotFoundError(path) {
  return new Error(
    [
      `GET ${path} failed with 404 from ${baseUrl}.`,
      'The smoke script reached an Artifact API-shaped server, but it does not expose /api/health.',
      'Restart npm run dev:api from the current checkout, or set API_SMOKE_BASE_URL to the API server URL.',
      'Do not point API_SMOKE_BASE_URL at the React Router/Vercel web server.',
    ].join(' '),
  );
}

async function main() {
  await checkHealth();
  await checkAccess();
  const job = await createGeneration();
  const current = await pollGeneration(job);
  await downloadAsset(current);
  log('smoke.ok', { jobId: current.id });
}

async function checkHealth() {
  log('health.start', { baseUrl });
  const health = await requestJson('/api/health');
  assert(health.ok === true, 'Health response did not include ok=true');
  log('health.ok', {
    databaseDriver: health.databaseDriver,
    queueDriver: health.queueDriver,
    storageDriver: health.storageDriver,
    providers: health.providers,
  });
}

async function checkAccess() {
  const access = await requestJson('/api/ai/access');
  assert(access.authenticated === true, 'Smoke token did not authenticate');
  assert(access.enabled === true, `AI access is disabled: ${access.disabledReason ?? 'unknown'}`);
  log('access.ok', { quota: access.quota, providers: access.providers });
}

async function createGeneration() {
  const idempotencyKey = `smoke-${Date.now()}`;
  const job = await requestJson('/api/ai/generations', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'private alpha smoke test image, abstract album cover texture',
      provider,
      settings: { aspect: '1:1', quality: 'draft', stylePreset: 'smoke' },
      idempotencyKey,
    }),
  });
  assert(typeof job.id === 'string' && job.id.length > 0, 'Generation response did not include a job id');
  log('generation.created', { id: job.id, status: job.status, provider: job.provider });
  return job;
}

async function pollGeneration(job) {
  const deadline = Date.now() + timeoutMs;
  let current = job;
  while (Date.now() < deadline) {
    current = await requestJson(`/api/ai/generations/${encodeURIComponent(job.id)}`);
    log('generation.polled', { id: current.id, status: current.status });
    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  assert(current.status === 'succeeded', `Generation did not succeed, final status: ${current.status}`);
  assert(current.asset?.uri, 'Succeeded generation did not include an asset URI');
  return current;
}

async function downloadAsset(current) {
  const assetResponse = await fetch(new URL(current.asset.uri, baseUrl), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  assert(assetResponse.ok, `Asset download failed with ${assetResponse.status}`);
  const bytes = new Uint8Array(await assetResponse.arrayBuffer());
  assert(bytes.byteLength > 0, 'Asset download returned an empty file');
  log('asset.downloaded', {
    assetId: current.asset.id,
    mimeType: assetResponse.headers.get('content-type'),
    bytes: bytes.byteLength,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
