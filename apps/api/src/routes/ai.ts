import { randomUUID } from 'node:crypto';
import { computeAiAccessResponse, type RequestLike, type RequestUserResolution } from '../auth.js';
import type {
  AiAccessResponse,
  AiGenerationAssetResponse,
  AiGenerationJobResponse,
  AiGenerationSettings,
  AiProvider,
  AiShaderGenerationResponse,
  AiShaderRequestMode,
  CreateAiShaderRequest,
  CreateGenerationRequest,
} from '../contracts.js';
import { AI_API_PATHS, AI_PROVIDERS } from '../contracts.js';
import { isActiveGenerationJobExistsError } from '../db/errors.js';
import type { ApiRepositories } from '../db/repositories.js';
import type { AiGenerationJobRow, AiShaderRequestRow, AssetRow, JsonObject } from '../db/types.js';
import { errorJson, type JsonResponse, json, readJsonBody } from '../http.js';
import { logInfo, logWarn } from '../logger.js';
import {
  isOpenAiShaderTimeoutError,
  type ProviderRegistry,
  type ShaderGenerationProvider,
} from '../providers/index.js';
import type { GenerationQueue } from '../queue.js';
import { checkOneActiveJob, createQuotaSnapshot, getMonthlyQuotaPeriod, type MonthlyQuotaCheck } from '../quota.js';
import type { InMemoryRateLimiter } from '../rateLimit.js';
import { generateLocalShaderInstanceFromPrompt, validateShaderPrompt } from '../shaderGenerator.js';

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
  shaderProvider?: ShaderGenerationProvider;
  now?: () => Date;
  createId?: () => string;
}

type AiRouteHandler = (
  request: AiRouteRequest,
  deps: AiRouteDeps,
  pathname: string,
) => Promise<JsonResponse<
  AiAccessResponse | AiGenerationJobResponse | AiShaderGenerationResponse | { code: string; message: string }
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
    match: (method, pathname) => method === 'POST' && pathname === AI_API_PATHS.shader,
    handle: handleCreateShaderRoute,
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
  AiAccessResponse | AiGenerationJobResponse | AiShaderGenerationResponse | { code: string; message: string }
> | null> {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;
  const route = AI_ROUTE_HANDLERS.find((candidate) => candidate.match(method, pathname));
  return route ? route.handle(request, deps, pathname) : null;
}

async function handleCreateShaderRoute(request: AiRouteRequest, deps: AiRouteDeps) {
  const body = await readCreateShaderBody(request);
  return body.ok ? handleCreateShaderRequest(request, body.value, deps) : body.response;
}

async function handleCreateGenerationRoute(request: AiRouteRequest, deps: AiRouteDeps) {
  const body = await readCreateGenerationBody(request);
  return body.ok ? handleCreateGenerationRequest(request, body.value, deps) : body.response;
}

async function readCreateShaderBody(
  request: AiRouteRequest,
): Promise<
  { ok: true; value: CreateAiShaderRequest } | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  try {
    return { ok: true, value: await readJsonBody<CreateAiShaderRequest>(request) };
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

export async function handleCreateShaderRequest(
  request: RequestLike,
  body: CreateAiShaderRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiShaderGenerationResponse | { code: string; message: string }>> {
  const authResult = await authenticateCreateShader(request, deps);
  if (!authResult.ok) return authResult.response;

  const promptResult = validateShaderPrompt(body?.prompt);
  if (!promptResult.ok) return errorJson(400, promptResult.code, promptResult.message);

  const modeResult = validateShaderMode(body?.mode);
  if (!modeResult.ok) return errorJson(400, modeResult.code, modeResult.message);

  const idempotencyResult = validateShaderIdempotencyKey(body?.idempotencyKey);
  if (!idempotencyResult.ok) return errorJson(400, idempotencyResult.code, idempotencyResult.message);

  const existing = await deps.repositories.shaderRequests.findByIdempotencyKey(
    authResult.user.id,
    idempotencyResult.idempotencyKey,
  );
  if (existing) return storedShaderResponse(existing, promptResult.prompt, modeResult.mode);

  if (modeResult.mode === 'localFallback') {
    const fallbackReference = validateShaderIdempotencyKey(body?.fallbackForIdempotencyKey);
    if (!fallbackReference.ok) {
      return errorJson(400, 'invalid_fallback_reference', 'A failed OpenAI request is required for a local draft.');
    }
    const openAiAttempt = await deps.repositories.shaderRequests.findByIdempotencyKey(
      authResult.user.id,
      fallbackReference.idempotencyKey,
    );
    const fallbackEligibleErrorCodes = new Set([
      'shader_provider_unavailable',
      'shader_provider_timeout',
      'shader_provider_failed',
    ]);
    if (
      !openAiAttempt ||
      openAiAttempt.mode !== 'openai' ||
      openAiAttempt.status !== 'failed' ||
      openAiAttempt.prompt !== promptResult.prompt ||
      !openAiAttempt.error_code ||
      !fallbackEligibleErrorCodes.has(openAiAttempt.error_code)
    ) {
      return errorJson(409, 'fallback_not_available', 'Try creating with AI before making a local draft.');
    }
  }

  const rateLimitResponse = createShaderRateLimitResponse(authResult.user.id, deps);
  if (rateLimitResponse) return rateLimitResponse;

  const claimed = await deps.repositories.shaderRequests.claim({
    id: deps.createId?.() ?? randomUUID(),
    userId: authResult.user.id,
    idempotencyKey: idempotencyResult.idempotencyKey,
    mode: modeResult.mode,
    prompt: promptResult.prompt,
  });
  if (!claimed.claimed) return storedShaderResponse(claimed.row, promptResult.prompt, modeResult.mode);

  if (modeResult.mode === 'openai' && !deps.shaderProvider) {
    const failure = {
      status: 503,
      code: 'shader_provider_unavailable',
      message: 'OpenAI shader generation is not configured.',
    };
    await deps.repositories.shaderRequests.markFailed(claimed.row.id, {
      ...failure,
      completedAt: deps.now?.() ?? new Date(),
    });
    return errorJson(failure.status, failure.code, failure.message);
  }

  const period = getMonthlyQuotaPeriod(deps.now?.());
  if (modeResult.mode === 'openai') {
    const reserved = await deps.repositories.usage.reserveMonthlyGeneration({
      userId: authResult.user.id,
      period,
      generationLimit: deps.monthlyGenerationLimit,
    });
    if (!reserved) {
      const failure = { status: 429, code: 'quota_exceeded', message: 'Monthly generation quota used.' };
      await deps.repositories.shaderRequests.markFailed(claimed.row.id, {
        ...failure,
        completedAt: deps.now?.() ?? new Date(),
      });
      logWarn('ai_shader.create_denied', { userId: authResult.user.id, reason: failure.code });
      return errorJson(failure.status, failure.code, failure.message);
    }
  }

  const shaderResult = await createShader(promptResult.prompt, modeResult.mode, claimed.row.id, deps);
  if (!shaderResult.ok) {
    await deps.repositories.shaderRequests.markFailed(claimed.row.id, {
      ...shaderResult.failure,
      completedAt: deps.now?.() ?? new Date(),
    });
    return errorJson(shaderResult.failure.status, shaderResult.failure.code, shaderResult.failure.message);
  }
  const responseBody: AiShaderGenerationResponse = {
    prompt: promptResult.prompt,
    instance: shaderResult.instance,
    source: shaderResult.source,
    ...(shaderResult.model ? { model: shaderResult.model } : {}),
  };
  await deps.repositories.shaderRequests.complete({
    id: claimed.row.id,
    responseJson: toJsonObject(responseBody),
    providerRequestId: shaderResult.providerRequestId,
    providerUsageJson: shaderResult.usage ? toJsonObject(shaderResult.usage) : null,
    completedAt: deps.now?.() ?? new Date(),
  });
  logInfo('ai_shader.generated', {
    requestId: claimed.row.id,
    userId: authResult.user.id,
    source: shaderResult.source,
    model: shaderResult.model,
    properties: shaderResult.instance.definition.properties.length,
    codeLength: shaderResult.instance.definition.code.length,
    providerRequestId: shaderResult.providerRequestId,
    inputTokens: shaderResult.usage?.inputTokens,
    outputTokens: shaderResult.usage?.outputTokens,
  });

  return json(200, responseBody);
}

async function createShader(
  prompt: string,
  mode: AiShaderRequestMode,
  clientRequestId: string,
  deps: AiRouteDeps,
): Promise<
  | {
      ok: true;
      instance: AiShaderGenerationResponse['instance'];
      source: AiShaderGenerationResponse['source'];
      model?: string;
      providerRequestId?: string;
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    }
  | { ok: false; failure: { status: number; code: string; message: string } }
> {
  if (mode === 'localFallback') {
    const instance = generateLocalShaderInstanceFromPrompt(prompt);
    return {
      ok: true,
      source: 'localFallback',
      instance,
      model: instance.definition.provenance?.model,
    };
  }

  if (!deps.shaderProvider) throw new Error('Shader provider was not checked before generation.');

  try {
    const model = deps.shaderProvider.defaultModel;
    const result = await deps.shaderProvider.generateShader({ prompt, clientRequestId });
    return {
      ok: true,
      source: 'openai',
      instance: {
        ...result.instance,
        definition: {
          ...result.instance.definition,
          provenance: { source: 'openai', prompt, model },
        },
      },
      model,
      providerRequestId: result.requestId,
      usage: result.usage,
    };
  } catch (error) {
    const timedOut = isOpenAiShaderTimeoutError(error);
    const failure = timedOut
      ? {
          status: 504,
          code: 'shader_provider_timeout',
          message: 'Shader generation took too long. Try again.',
        }
      : {
          status: 502,
          code: 'shader_provider_failed',
          message: 'Shader generation failed. Try again or adjust the prompt.',
        };
    logWarn('ai_shader.provider_failed', {
      requestId: clientRequestId,
      provider: deps.shaderProvider.provider,
      model: deps.shaderProvider.defaultModel,
      code: failure.code,
      reason: error instanceof Error ? error.message : 'unknown_error',
    });
    return { ok: false, failure };
  }
}

function storedShaderResponse(
  request: AiShaderRequestRow,
  prompt: string,
  mode: AiShaderRequestMode,
): JsonResponse<AiShaderGenerationResponse | { code: string; message: string }> {
  if (request.prompt !== prompt || request.mode !== mode) {
    return errorJson(409, 'idempotency_conflict', 'This request key was already used for another shader.');
  }
  if (request.status === 'pending') {
    return errorJson(409, 'shader_request_in_progress', 'This shader is still being created. Try again shortly.');
  }
  if (request.status === 'failed') {
    return errorJson(
      request.error_status ?? 502,
      request.error_code ?? 'shader_provider_failed',
      request.error_message ?? 'Shader generation failed. Try again.',
    );
  }
  if (!request.response_json) {
    return errorJson(500, 'shader_response_missing', 'The saved shader response is unavailable.');
  }
  logInfo('ai_shader.idempotency_hit', {
    requestId: request.id,
    userId: request.user_id,
    source: request.mode,
  });
  return json(200, request.response_json as unknown as AiShaderGenerationResponse);
}

function validateShaderMode(
  value: unknown,
): { ok: true; mode: AiShaderRequestMode } | { ok: false; code: string; message: string } {
  if (value === undefined || value === null) return { ok: true, mode: 'openai' };
  if (value === 'openai' || value === 'localFallback') return { ok: true, mode: value };
  return { ok: false, code: 'invalid_shader_mode', message: 'Shader generation mode is not supported.' };
}

function validateShaderIdempotencyKey(
  value: unknown,
): { ok: true; idempotencyKey: string } | { ok: false; code: string; message: string } {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(value)) {
    return {
      ok: false,
      code: 'invalid_idempotency_key',
      message: 'A valid request key is required.',
    };
  }
  return { ok: true, idempotencyKey: value };
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
  if (!created.ok) {
    await deps.repositories.usage.releaseMonthlyGeneration(user.id, quotaCheck.quota.period);
    return created.response;
  }

  const job = created.job;
  const enqueued = await enqueueGenerationJob(job, user.id, quotaCheck.quota.period, deps);
  if (!enqueued.ok) return enqueued.response;

  logInfo('ai_generation.queued', {
    jobId: job.id,
    userId: user.id,
    provider,
    model,
    quotaRemaining: quotaCheck.quota.remaining,
  });

  return json(201, await toJobResponseForUser(job, user.id, deps.repositories, quotaCheck.quota));
}

type AuthenticatedUserRow = NonNullable<Awaited<ReturnType<typeof ensureAuthenticatedUser>>>;
type CreateGenerationPrepared = {
  provider: AiProvider;
  model: string;
  quotaCheck: MonthlyQuotaCheck;
  user: AuthenticatedUserRow;
};

async function authenticateCreateShader(
  request: RequestLike,
  deps: AiRouteDeps,
): Promise<
  { ok: true; user: AuthenticatedUserRow } | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    logWarn('ai_shader.create_denied', { reason: 'unauthenticated' });
    return { ok: false, response: errorJson(401, 'unauthenticated', 'Sign in before generating shaders.') };
  }

  const user = await ensureAuthenticatedUser(auth, deps);
  if (!user?.ai_enabled || user.disabled_at) {
    logWarn('ai_shader.create_denied', { userId: auth.user.id, reason: 'not_enabled' });
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

  const period = getMonthlyQuotaPeriod(deps.now?.());
  const reserved = await deps.repositories.usage.reserveMonthlyGeneration({
    userId,
    period,
    generationLimit: deps.monthlyGenerationLimit,
  });
  if (!reserved) {
    logWarn('ai_generation.create_denied', { userId, reason: 'quota_exceeded' });
    return { ok: false, response: errorJson(429, 'quota_exceeded', 'Monthly generation quota used.') };
  }
  const quotaCheck: MonthlyQuotaCheck = {
    allowed: true,
    quota: createQuotaSnapshot(period, deps.monthlyGenerationLimit, reserved.generation_count),
  };

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

function createShaderRateLimitResponse(userId: string, deps: AiRouteDeps) {
  const rate = deps.createRateLimiter?.check(`shader:create:user:${userId}`);
  if (!rate || rate.allowed) return null;
  logWarn('ai_shader.create_denied', { userId, reason: 'rate_limited' });
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
    await deps.repositories.usage.releaseMonthlyGeneration(userId, period);
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

function toJsonObject(value: object): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
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
