import { randomUUID } from 'node:crypto';
import { computeAiAccessResponse, type RequestLike, type RequestUserResolution } from '../auth.js';
import type {
  AiAccessResponse,
  AiGenerationAssetResponse,
  AiGenerationJobResponse,
  AiGenerationSettings,
  AiProvider,
  AiShaderSpecGenerationResponse,
  AiShaderSpecRequestMode,
  CreateAiShaderSpecRequest,
  CreateGenerationRequest,
} from '../contracts.js';
import { AI_API_PATHS, AI_PROVIDERS } from '../contracts.js';
import { generateCustomShaderSpecFromPrompt, validateShaderPrompt } from '../customShaderSpecGenerator.js';
import { isActiveGenerationJobExistsError } from '../db/errors.js';
import type { ApiRepositories } from '../db/repositories.js';
import type { AiGenerationJobRow, AssetRow, JsonObject } from '../db/types.js';
import { errorJson, type JsonResponse, json, readJsonBody } from '../http.js';
import { logInfo, logWarn } from '../logger.js';
import type { ProviderRegistry, ShaderSpecGenerationProvider } from '../providers/index.js';
import type { GenerationQueue } from '../queue.js';
import {
  checkMonthlyQuota,
  checkOneActiveJob,
  createQuotaSnapshot,
  getMonthlyQuotaPeriod,
  type MonthlyQuotaCheck,
} from '../quota.js';
import type { InMemoryRateLimiter } from '../rateLimit.js';

export interface AiRouteRequest extends RequestLike, AsyncIterable<Buffer> {
  method?: string;
  url?: string;
}

export interface AiRouteDeps {
  repositories: ApiRepositories;
  queue: GenerationQueue;
  providers: ProviderRegistry;
  resolveAuth(request: RequestLike): Promise<RequestUserResolution>;
  monthlyGenerationLimit: number;
  maxActiveJobsPerUser: number;
  createRateLimiter?: InMemoryRateLimiter;
  shaderSpecProvider?: ShaderSpecGenerationProvider;
  now?: () => Date;
  createId?: () => string;
}

type AiRouteHandler = (
  request: AiRouteRequest,
  deps: AiRouteDeps,
  pathname: string,
) => Promise<JsonResponse<
  AiAccessResponse | AiGenerationJobResponse | AiShaderSpecGenerationResponse | { code: string; message: string }
> | null>;

const AI_ROUTE_HANDLERS: Array<{
  match: (method: string, pathname: string) => boolean;
  handle: AiRouteHandler;
}> = [
  {
    match: (method, pathname) => method === 'GET' && pathname === '/api/ai/access',
    handle: (request, deps) => handleAccessRequest(request, deps),
  },
  {
    match: (method, pathname) => method === 'POST' && pathname === AI_API_PATHS.shaderSpec,
    handle: handleCreateShaderSpecRoute,
  },
  {
    match: (method, pathname) => method === 'POST' && pathname === '/api/ai/generations',
    handle: handleCreateGenerationRoute,
  },
  {
    match: (method, pathname) => method === 'GET' && generationIdFromPath(pathname) !== null,
    handle: (request, deps, pathname) =>
      handleGetGenerationRequest(request, generationIdFromPath(pathname) ?? '', deps),
  },
  {
    match: (method, pathname) => method === 'POST' && cancelGenerationIdFromPath(pathname) !== null,
    handle: (request, deps, pathname) =>
      handleCancelGenerationRequest(request, cancelGenerationIdFromPath(pathname) ?? '', deps),
  },
];

export async function handleAiRequest(
  request: AiRouteRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<
  AiAccessResponse | AiGenerationJobResponse | AiShaderSpecGenerationResponse | { code: string; message: string }
> | null> {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;
  const route = AI_ROUTE_HANDLERS.find((candidate) => candidate.match(method, pathname));
  return route ? route.handle(request, deps, pathname) : null;
}

async function handleCreateShaderSpecRoute(request: AiRouteRequest, deps: AiRouteDeps) {
  const body = await readCreateShaderSpecBody(request);
  return body.ok ? handleCreateShaderSpecRequest(request, body.value, deps) : body.response;
}

async function handleCreateGenerationRoute(request: AiRouteRequest, deps: AiRouteDeps) {
  const body = await readCreateGenerationBody(request);
  return body.ok ? handleCreateGenerationRequest(request, body.value, deps) : body.response;
}

async function readCreateShaderSpecBody(
  request: AiRouteRequest,
): Promise<
  | { ok: true; value: CreateAiShaderSpecRequest }
  | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  try {
    return { ok: true, value: await readJsonBody<CreateAiShaderSpecRequest>(request) };
  } catch {
    return { ok: false, response: errorJson(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
}

async function readCreateGenerationBody(
  request: AiRouteRequest,
): Promise<
  | { ok: true; value: CreateGenerationRequest }
  | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  try {
    return { ok: true, value: await readJsonBody<CreateGenerationRequest>(request) };
  } catch {
    return { ok: false, response: errorJson(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
}

function generationIdFromPath(pathname: string) {
  const match = /^\/api\/ai\/generations\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function cancelGenerationIdFromPath(pathname: string) {
  const match = /^\/api\/ai\/generations\/([^/]+)\/cancel$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function handleAccessRequest(
  request: RequestLike,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiAccessResponse>> {
  const auth = await deps.resolveAuth(request);
  const user = auth.authenticated ? await ensureAuthenticatedUser(auth, deps) : null;
  logInfo('ai_generation.access_checked', {
    authenticated: auth.authenticated,
    reason: auth.authenticated ? undefined : auth.reason,
    userId: auth.authenticated ? auth.user.id : undefined,
    aiEnabled: Boolean(user?.ai_enabled && !user.disabled_at),
  });
  const period = getMonthlyQuotaPeriod(deps.now?.());
  const quota = auth.authenticated
    ? createQuotaSnapshot(
        period,
        deps.monthlyGenerationLimit,
        await deps.repositories.usage.countMonthlyGenerations(auth.user.id, period),
      )
    : undefined;

  return json(
    200,
    computeAiAccessResponse({
      auth,
      aiEnabled: Boolean(user?.ai_enabled && !user.disabled_at),
      providers: user?.ai_enabled ? providerNames(deps.providers) : [],
      quota,
    }),
  );
}

export async function handleCreateShaderSpecRequest(
  request: RequestLike,
  body: CreateAiShaderSpecRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiShaderSpecGenerationResponse | { code: string; message: string }>> {
  const authResult = await authenticateCreateShaderSpec(request, deps);
  if (!authResult.ok) return authResult.response;

  const promptResult = validateShaderPrompt(body?.prompt);
  if (!promptResult.ok) return errorJson(400, promptResult.code, promptResult.message);

  const rateLimitResponse = createShaderSpecRateLimitResponse(authResult.user.id, deps);
  if (rateLimitResponse) return rateLimitResponse;

  const modeResult = validateShaderSpecMode(body?.mode);
  if (!modeResult.ok) return errorJson(400, modeResult.code, modeResult.message);

  const specResult = await createShaderSpec(promptResult.prompt, modeResult.mode, deps);
  if (!specResult.ok) return specResult.response;
  logInfo('ai_shader_spec.generated', {
    userId: authResult.user.id,
    source: specResult.source,
    model: specResult.model,
    operations: specResult.spec.operations.length,
  });

  return json(200, {
    prompt: promptResult.prompt,
    spec: specResult.spec,
    source: specResult.source,
    ...(specResult.model ? { model: specResult.model } : {}),
  });
}

async function createShaderSpec(
  prompt: string,
  mode: AiShaderSpecRequestMode,
  deps: AiRouteDeps,
): Promise<
  | {
      ok: true;
      spec: AiShaderSpecGenerationResponse['spec'];
      source: AiShaderSpecGenerationResponse['source'];
      model?: string;
    }
  | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  if (mode === 'localFallback') {
    const spec = generateCustomShaderSpecFromPrompt(prompt);
    return {
      ok: true,
      source: 'localFallback',
      spec: {
        ...spec,
        provenance: { source: 'localFallback', model: 'deterministic-local-mapper' },
      },
      model: 'deterministic-local-mapper',
    };
  }

  if (!deps.shaderSpecProvider) {
    return {
      ok: false,
      response: errorJson(503, 'shader_provider_unavailable', 'OpenAI shader generation is not configured.'),
    };
  }

  try {
    const model = deps.shaderSpecProvider.defaultModel;
    const spec = await deps.shaderSpecProvider.generateShaderSpec({ prompt });
    return {
      ok: true,
      source: 'openai',
      spec: {
        ...spec,
        provenance: { source: 'openai', model },
      },
      model,
    };
  } catch (error) {
    logWarn('ai_shader_spec.provider_failed', {
      provider: deps.shaderSpecProvider.provider,
      model: deps.shaderSpecProvider.defaultModel,
      reason: error instanceof Error ? error.message : 'unknown_error',
    });
    return {
      ok: false,
      response: errorJson(502, 'shader_provider_failed', 'Shader generation failed. Try again or adjust the prompt.'),
    };
  }
}

function validateShaderSpecMode(
  value: unknown,
): { ok: true; mode: AiShaderSpecRequestMode } | { ok: false; code: string; message: string } {
  if (value === undefined || value === null) return { ok: true, mode: 'openai' };
  if (value === 'openai' || value === 'localFallback') return { ok: true, mode: value };
  return { ok: false, code: 'invalid_shader_mode', message: 'Shader generation mode is not supported.' };
}

export async function handleCreateGenerationRequest(
  request: RequestLike,
  body: CreateGenerationRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiGenerationJobResponse | { code: string; message: string }>> {
  const prepared = await prepareCreateGeneration(request, body, deps);
  if (!prepared.ok) return prepared.response;

  const { provider, model, quotaCheck, user } = prepared;
  const created = await createGenerationJob(body, prepared, deps);
  if (!created.ok) return created.response;

  const job = created.job;
  await recordGenerationUsage(user.id, quotaCheck.quota.period, 1, deps);
  const enqueued = await enqueueGenerationJob(job, user.id, quotaCheck.quota.period, deps);
  if (!enqueued.ok) return enqueued.response;

  logInfo('ai_generation.queued', {
    jobId: job.id,
    userId: user.id,
    provider,
    model,
    quotaRemaining: quotaCheck.quota.remaining - 1,
  });

  return json(
    201,
    await toJobResponseForUser(
      job,
      user.id,
      deps.repositories,
      createQuotaSnapshot(quotaCheck.quota.period, deps.monthlyGenerationLimit, quotaCheck.quota.used + 1),
    ),
  );
}

type AuthenticatedUserRow = NonNullable<Awaited<ReturnType<typeof ensureAuthenticatedUser>>>;
type CreateGenerationPrepared = {
  provider: AiProvider;
  model: string;
  quotaCheck: MonthlyQuotaCheck;
  user: AuthenticatedUserRow;
};

async function authenticateCreateShaderSpec(
  request: RequestLike,
  deps: AiRouteDeps,
): Promise<
  { ok: true; user: AuthenticatedUserRow } | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    logWarn('ai_shader_spec.create_denied', { reason: 'unauthenticated' });
    return { ok: false, response: errorJson(401, 'unauthenticated', 'Sign in before generating shaders.') };
  }

  const user = await ensureAuthenticatedUser(auth, deps);
  if (!user?.ai_enabled || user.disabled_at) {
    logWarn('ai_shader_spec.create_denied', { userId: auth.user.id, reason: 'not_enabled' });
    return { ok: false, response: errorJson(403, 'not_enabled', 'AI shader generation is not enabled for this user.') };
  }
  return { ok: true, user };
}

async function prepareCreateGeneration(
  request: RequestLike,
  body: CreateGenerationRequest,
  deps: AiRouteDeps,
): Promise<
  | ({ ok: true } & CreateGenerationPrepared)
  | { ok: false; response: JsonResponse<AiGenerationJobResponse | { code: string; message: string }> }
> {
  const authResult = await authenticateCreateGeneration(request, deps);
  if (!authResult.ok) return authResult;

  const requestResult = createGenerationRequestInfo(body, deps);
  if (!requestResult.ok) return requestResult;

  const existing = await existingGenerationResponse(authResult.user.id, body.idempotencyKey, deps);
  if (existing) return { ok: false, response: existing };

  const capacityResult = await ensureCreateGenerationCapacity(authResult.user.id, deps);
  if (!capacityResult.ok) return capacityResult;

  return {
    ok: true,
    model: requestResult.model,
    provider: requestResult.provider,
    quotaCheck: capacityResult.quotaCheck,
    user: authResult.user,
  };
}

async function authenticateCreateGeneration(
  request: RequestLike,
  deps: AiRouteDeps,
): Promise<
  { ok: true; user: AuthenticatedUserRow } | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    logWarn('ai_generation.create_denied', { reason: 'unauthenticated' });
    return { ok: false, response: errorJson(401, 'unauthenticated', 'Sign in before generating images.') };
  }

  const user = await ensureAuthenticatedUser(auth, deps);
  if (!user?.ai_enabled || user.disabled_at) {
    logWarn('ai_generation.create_denied', { userId: auth.user.id, reason: 'not_enabled' });
    return { ok: false, response: errorJson(403, 'not_enabled', 'AI generation is not enabled for this user.') };
  }
  return { ok: true, user };
}

function createGenerationRequestInfo(
  body: CreateGenerationRequest,
  deps: AiRouteDeps,
):
  | { ok: true; provider: AiProvider; model: string }
  | { ok: false; response: JsonResponse<{ code: string; message: string }> } {
  const requestCheck = validateCreateGenerationRequest(body);
  if (!requestCheck.ok) return { ok: false, response: errorJson(400, requestCheck.code, requestCheck.message) };

  const provider = requestCheck.provider;
  const providerAdapter = deps.providers.get(provider);
  const model = body.model?.trim() || providerAdapter.defaultModel;
  return { ok: true, provider, model };
}

async function ensureCreateGenerationCapacity(
  userId: string,
  deps: AiRouteDeps,
): Promise<
  { ok: true; quotaCheck: MonthlyQuotaCheck } | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  const rateLimitResponse = createGenerationRateLimitResponse(userId, deps);
  if (rateLimitResponse) return { ok: false, response: rateLimitResponse };
  const quotaCheck = await checkMonthlyQuota({
    limit: deps.monthlyGenerationLimit,
    usageReader: deps.repositories.usage,
    userId,
    now: deps.now?.(),
  });
  if (!quotaCheck.allowed) {
    logWarn('ai_generation.create_denied', { userId, reason: 'quota_exceeded' });
    return { ok: false, response: errorJson(429, 'quota_exceeded', 'Monthly generation quota used.') };
  }

  const activeCheck = await checkOneActiveJob({
    activeJobReader: deps.repositories.jobs,
    maxActiveJobs: deps.maxActiveJobsPerUser,
    userId,
  });
  if (!activeCheck.allowed) {
    logWarn('ai_generation.create_denied', { userId, reason: 'active_job_exists' });
    return {
      ok: false,
      response: errorJson(409, 'active_job_exists', 'Wait for the active generation job to finish.'),
    };
  }

  return { ok: true, quotaCheck };
}

async function existingGenerationResponse(userId: string, idempotencyKey: string, deps: AiRouteDeps) {
  const existing = await deps.repositories.jobs.findByIdempotencyKey(userId, idempotencyKey);
  if (!existing) return null;
  logInfo('ai_generation.idempotency_hit', { jobId: existing.id, userId, status: existing.status });
  const period = getMonthlyQuotaPeriod(deps.now?.());
  const quota = createQuotaSnapshot(
    period,
    deps.monthlyGenerationLimit,
    await deps.repositories.usage.countMonthlyGenerations(userId, period),
  );
  return json(200, await toJobResponseForUser(existing, userId, deps.repositories, quota));
}

function createGenerationRateLimitResponse(userId: string, deps: AiRouteDeps) {
  const rate = deps.createRateLimiter?.check(`generation:create:user:${userId}`);
  if (!rate || rate.allowed) return null;
  logWarn('ai_generation.create_denied', { userId, reason: 'rate_limited' });
  return json(
    429,
    { code: 'rate_limited', message: 'Too many generation requests.' },
    { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1000)) },
  );
}

function createShaderSpecRateLimitResponse(userId: string, deps: AiRouteDeps) {
  const rate = deps.createRateLimiter?.check(`shader-spec:create:user:${userId}`);
  if (!rate || rate.allowed) return null;
  logWarn('ai_shader_spec.create_denied', { userId, reason: 'rate_limited' });
  return json(
    429,
    { code: 'rate_limited', message: 'Too many shader generation requests.' },
    { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1000)) },
  );
}

async function createGenerationJob(
  body: CreateGenerationRequest,
  prepared: CreateGenerationPrepared,
  deps: AiRouteDeps,
): Promise<
  { ok: true; job: AiGenerationJobRow } | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  try {
    return {
      ok: true,
      job: await deps.repositories.jobs.create({
        id: deps.createId?.() ?? randomUUID(),
        userId: prepared.user.id,
        provider: prepared.provider,
        model: prepared.model,
        prompt: body.prompt.trim(),
        negativePrompt: body.settings.negativePrompt,
        settingsJson: settingsToJson(body.settings),
        idempotencyKey: body.idempotencyKey,
      }),
    };
  } catch (error) {
    if (isActiveGenerationJobExistsError(error)) {
      logWarn('ai_generation.create_denied', { userId: prepared.user.id, reason: 'active_job_exists' });
      return {
        ok: false,
        response: errorJson(409, 'active_job_exists', 'Wait for the active generation job to finish.'),
      };
    }
    throw error;
  }
}

async function recordGenerationUsage(userId: string, period: string, generationCountDelta: number, deps: AiRouteDeps) {
  await deps.repositories.usage.upsertMonthlyUsage({
    userId,
    period,
    generationLimit: deps.monthlyGenerationLimit,
    generationCountDelta,
  });
}

async function enqueueGenerationJob(
  job: AiGenerationJobRow,
  userId: string,
  period: string,
  deps: AiRouteDeps,
): Promise<{ ok: true } | { ok: false; response: JsonResponse<{ code: string; message: string }> }> {
  try {
    await deps.queue.enqueue({ jobId: job.id, userId }, { jobId: job.id });
    return { ok: true };
  } catch (error) {
    logWarn('ai_generation.enqueue_failed', {
      jobId: job.id,
      userId,
      reason: error instanceof Error ? error.message : 'unknown_error',
    });
    await deps.repositories.jobs.markFailed(job.id, {
      code: 'queue_enqueue_failed',
      message: 'Generation queue is unavailable. Try again later.',
      retryable: true,
    });
    await recordGenerationUsage(userId, period, -1, deps);
    return {
      ok: false,
      response: errorJson(503, 'queue_unavailable', 'Generation queue is unavailable. Try again later.'),
    };
  }
}

async function ensureAuthenticatedUser(
  auth: Extract<RequestUserResolution, { authenticated: true }>,
  deps: AiRouteDeps,
) {
  return deps.repositories.users.upsertFromAuth({
    id: auth.user.id,
    email: auth.user.email ?? null,
  });
}

export async function handleGetGenerationRequest(
  request: RequestLike,
  jobId: string,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiGenerationJobResponse | { code: string; message: string }>> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) return errorJson(401, 'unauthenticated', 'Sign in before reading generation jobs.');

  const job = await deps.repositories.jobs.findByIdForUser(jobId, auth.user.id);
  if (!job) return errorJson(404, 'not_found', 'Generation job not found.');

  return json(200, await toJobResponseForUser(job, auth.user.id, deps.repositories));
}

export async function handleCancelGenerationRequest(
  request: RequestLike,
  jobId: string,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiGenerationJobResponse | { code: string; message: string }>> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) return errorJson(401, 'unauthenticated', 'Sign in before cancelling generation jobs.');

  const job = await deps.repositories.jobs.findByIdForUser(jobId, auth.user.id);
  if (!job) return errorJson(404, 'not_found', 'Generation job not found.');
  if (job.status !== 'queued' && job.status !== 'running') {
    return errorJson(409, 'invalid_job_state', 'Only queued or running jobs can be cancelled.');
  }

  return json(
    200,
    await toJobResponseForUser(
      await deps.repositories.jobs.markCancelled(job.id, deps.now?.() ?? new Date()),
      auth.user.id,
      deps.repositories,
    ),
  );
}

function validateCreateGenerationRequest(
  body: CreateGenerationRequest,
): { ok: true; provider: AiProvider } | { ok: false; code: string; message: string } {
  const invalid = CREATE_GENERATION_VALIDATORS.find((validator) => validator.invalid(body))?.error;
  if (invalid) return { ok: false, ...invalid };
  const provider = body.provider ?? 'openai';
  if (!AI_PROVIDERS.includes(provider)) {
    return { ok: false, code: 'unsupported_provider', message: 'Generation provider is not supported.' };
  }
  return { ok: true, provider };
}

const CREATE_GENERATION_VALIDATORS: Array<{
  invalid: (body: CreateGenerationRequest) => boolean;
  error: { code: string; message: string };
}> = [
  {
    invalid: (body) => !body || typeof body !== 'object',
    error: { code: 'invalid_settings', message: 'Request body is required.' },
  },
  {
    invalid: (body) => typeof body.prompt !== 'string' || body.prompt.trim().length === 0,
    error: { code: 'invalid_prompt', message: 'Prompt is required.' },
  },
  {
    invalid: (body) => typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length === 0,
    error: { code: 'invalid_settings', message: 'Idempotency key is required.' },
  },
  {
    invalid: (body) => !isGenerationSettings(body.settings),
    error: { code: 'invalid_settings', message: 'Generation settings are invalid.' },
  },
];

function isGenerationSettings(value: unknown): value is AiGenerationSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    ['1:1', '4:5', '9:16', '16:9'].includes(String(settings.aspect)) &&
    ['draft', 'standard', 'high'].includes(String(settings.quality))
  );
}

function settingsToJson(settings: AiGenerationSettings): JsonObject {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)) as JsonObject;
}

async function toJobResponseForUser(
  job: AiGenerationJobRow,
  userId: string,
  repositories: ApiRepositories,
  quota?: AiGenerationJobResponse['quota'],
): Promise<AiGenerationJobResponse> {
  const asset = job.output_asset_id ? await repositories.assets.findByIdForUser(job.output_asset_id, userId) : null;
  return toJobResponse(job, quota, asset && !asset.deleted_at ? toAssetResponse(asset) : undefined);
}

function toJobResponse(
  job: AiGenerationJobRow,
  quota?: AiGenerationJobResponse['quota'],
  asset?: AiGenerationAssetResponse,
): AiGenerationJobResponse {
  return {
    id: job.id,
    status: job.status,
    provider: job.provider as AiProvider,
    model: job.model,
    prompt: job.prompt,
    settings: job.settings_json as unknown as AiGenerationSettings,
    asset,
    quota,
    error:
      job.error_code && job.error_message
        ? {
            code: job.error_code,
            message: job.error_message,
            retryable: job.retryable ?? undefined,
          }
        : undefined,
    createdAt: job.created_at.toISOString(),
    startedAt: job.started_at?.toISOString(),
    completedAt: job.completed_at?.toISOString(),
  };
}

function toAssetResponse(asset: AssetRow): AiGenerationAssetResponse {
  return {
    id: asset.id,
    uri: AI_API_PATHS.assetFile(asset.id),
    mimeType: asset.mime_type,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.size_bytes,
    createdAt: asset.created_at.toISOString(),
    metadata: asset.metadata_json as unknown as AiGenerationAssetResponse['metadata'],
  };
}

function providerNames(providers: ProviderRegistry): AiProvider[] {
  return providers.list().map((provider) => provider.provider);
}
