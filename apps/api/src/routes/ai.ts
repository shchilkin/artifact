import { randomUUID } from 'node:crypto';
import type { AccountAllowanceSnapshot, AiOperationFeature } from '@artifact/shared';
import { type AccountAccessDenialCode, AccountAccessService } from '../accountAccessService.js';
import { computeAiAccessResponse, type RequestLike, type RequestUserResolution } from '../auth.js';
import type {
  AiAccessResponse,
  AiGenerationAssetResponse,
  AiGenerationJobResponse,
  AiGenerationSettings,
  AiProvider,
  AiQuotaSnapshot,
  AiShaderCompilerDiagnostic,
  AiShaderGenerationResponse,
  AiShaderRequestMode,
  AiShaderValidationResponse,
  CreateAiShaderRequest,
  CreateGenerationRequest,
  ValidateAiShaderRequest,
} from '../contracts.js';
import { AI_API_PATHS, AI_PROVIDERS, AI_SHADER_DIAGNOSTIC_MAX_LENGTH, normalizeShaderInstance } from '../contracts.js';
import { isActiveGenerationJobExistsError } from '../db/errors.js';
import type { ApiRepositories } from '../db/repositories.js';
import type { AiGenerationJobRow, AiShaderRequestRow, AssetRow, JsonObject } from '../db/types.js';
import { errorJson, type JsonResponse, json, readJsonBody } from '../http.js';
import { logInfo, logWarn } from '../logger.js';
import { priceProviderUsage } from '../providerPricing.js';
import {
  isOpenAiShaderTimeoutError,
  OpenAiShaderResponseError,
  type ProviderRegistry,
  type ShaderGenerationProvider,
} from '../providers/index.js';
import { ProviderUsageService } from '../providerUsageService.js';
import type { GenerationQueue } from '../queue.js';
import type { MonthlyQuotaCheck } from '../quota.js';
import type { InMemoryRateLimiter } from '../rateLimit.js';
import { SafetyBudgetService } from '../safetyBudgetService.js';
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
  createRateLimiter?: InMemoryRateLimiter;
  shaderProvider?: ShaderGenerationProvider;
  now?: () => Date;
  createId?: () => string;
  createOperationId?: () => string;
  createUsageId?: () => string;
  safetyBudget?: SafetyBudgetService;
}

type AiRouteHandler = (
  request: AiRouteRequest,
  deps: AiRouteDeps,
  pathname: string,
) => Promise<JsonResponse<
  | AiAccessResponse
  | AiGenerationJobResponse
  | AiShaderGenerationResponse
  | AiShaderValidationResponse
  | { code: string; message: string }
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
    match: (method, pathname) => method === 'POST' && shaderValidationIdFromPath(pathname) !== null,
    handle: (request, deps, pathname) =>
      handleValidateShaderRoute(request, shaderValidationIdFromPath(pathname) ?? '', deps),
  },
  {
    match: (method, pathname) => method === 'POST' && shaderRepairIdFromPath(pathname) !== null,
    handle: (request, deps, pathname) =>
      handleRepairShaderRequest(request, shaderRepairIdFromPath(pathname) ?? '', deps),
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
  | AiAccessResponse
  | AiGenerationJobResponse
  | AiShaderGenerationResponse
  | AiShaderValidationResponse
  | { code: string; message: string }
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

async function handleValidateShaderRoute(request: AiRouteRequest, requestId: string, deps: AiRouteDeps) {
  try {
    const body = await readJsonBody<ValidateAiShaderRequest>(request);
    return handleValidateShaderRequest(request, requestId, body, deps);
  } catch {
    return errorJson(400, 'invalid_json', 'Request body must be valid JSON.');
  }
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

function shaderValidationIdFromPath(pathname: string) {
  const match = /^\/api\/ai\/shaders\/([^/]+)\/validation$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function shaderRepairIdFromPath(pathname: string) {
  const match = /^\/api\/ai\/shaders\/([^/]+)\/repair$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function handleAccessRequest(
  request: RequestLike,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiAccessResponse>> {
  const auth = await deps.resolveAuth(request);
  const user = auth.authenticated ? await ensureAuthenticatedUser(auth, deps) : null;
  const allowance = user && !user.disabled_at ? await createAccountAccessService(deps).getAllowance(user.id) : null;
  logInfo('ai_generation.access_checked', {
    authenticated: auth.authenticated,
    reason: auth.authenticated ? undefined : auth.reason,
    userId: auth.authenticated ? auth.user.id : undefined,
    tier: allowance?.tier,
  });
  const quota = allowance ? quotaFromAllowance(allowance) : undefined;

  const response = computeAiAccessResponse({
    auth,
    aiEnabled: Boolean(allowance?.providerAiEnabled && !user?.disabled_at),
    providers: allowance?.providerAiEnabled ? providerNames(deps.providers) : [],
    quota,
  });
  const budget = user && !user.disabled_at ? await createSafetyBudgetService(deps).check() : null;
  return json(200, {
    ...response,
    ...(budget && !budget.allowed && response.enabled
      ? { enabled: false, disabledReason: budget.code, providers: [] }
      : {}),
    ...(allowance ? { tier: allowance.tier } : {}),
  });
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

  const refineReference = validateOptionalShaderRequestId(body?.refineFromRequestId);
  if (!refineReference.ok) return errorJson(400, refineReference.code, refineReference.message);
  if (refineReference.requestId && modeResult.mode !== 'openai') {
    return errorJson(400, 'invalid_shader_refine_mode', 'Shader refinement requires AI creation.');
  }

  const existing = await deps.repositories.shaderRequests.findByIdempotencyKey(
    authResult.user.id,
    idempotencyResult.idempotencyKey,
  );
  if (existing) {
    return storedShaderResponse(existing, promptResult.prompt, modeResult.mode, refineReference.requestId);
  }

  if (modeResult.mode === 'openai') {
    const budgetResponse = await safetyBudgetDenialResponse(deps);
    if (budgetResponse) return budgetResponse;
  }

  const refinement = refineReference.requestId
    ? await resolveShaderRefinement(refineReference.requestId, authResult.user.id, deps)
    : { ok: true as const, value: null };
  if (!refinement.ok) return refinement.response;

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
      'shader_repair_failed',
      'shader_browser_validation_failed',
    ]);
    if (
      !openAiAttempt ||
      openAiAttempt.mode !== 'openai' ||
      openAiAttempt.parent_request_id !== null ||
      openAiAttempt.status !== 'failed' ||
      openAiAttempt.prompt !== promptResult.prompt ||
      !openAiAttempt.error_code ||
      !fallbackEligibleErrorCodes.has(openAiAttempt.error_code)
    ) {
      return errorJson(409, 'fallback_not_available', 'Try creating with AI before making a local draft.');
    }
  }

  const claimed = await deps.repositories.shaderRequests.claim({
    id: deps.createId?.() ?? randomUUID(),
    userId: authResult.user.id,
    idempotencyKey: idempotencyResult.idempotencyKey,
    mode: modeResult.mode,
    prompt: promptResult.prompt,
    parentRequestId: refineReference.requestId,
  });
  if (!claimed.claimed) {
    return storedShaderResponse(claimed.row, promptResult.prompt, modeResult.mode, refineReference.requestId);
  }

  if (modeResult.mode === 'openai') {
    const rateLimitResponse = createShaderRateLimitResponse(authResult.user.id, deps);
    if (rateLimitResponse) {
      await deps.repositories.shaderRequests.markFailed(claimed.row.id, {
        status: rateLimitResponse.status,
        code: 'rate_limited',
        message: 'Too many AI requests. Try again shortly.',
        completedAt: deps.now?.() ?? new Date(),
      });
      return rateLimitResponse;
    }
  }

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

  let operationId: string | null = null;
  const operationFeature: AiOperationFeature = refinement.value ? 'shader_refine' : 'shader_create';
  if (modeResult.mode === 'openai') {
    const reserved = await createAccountAccessService(deps).reserve({
      userId: authResult.user.id,
      feature: operationFeature,
      idempotencyKey: idempotencyResult.idempotencyKey,
    });
    if (!reserved.ok) {
      const failure = accountAccessDenial(reserved.code, 'shader');
      await deps.repositories.shaderRequests.markFailed(claimed.row.id, {
        ...failure,
        completedAt: deps.now?.() ?? new Date(),
      });
      logWarn('ai_shader.create_denied', { userId: authResult.user.id, reason: failure.code });
      return errorJson(failure.status, failure.code, failure.message);
    }
    operationId = reserved.operation.id;
    await deps.repositories.shaderRequests.attachOperation(claimed.row.id, operationId);
    await createAccountAccessService(deps).markRunning(operationId);
  }

  const shaderResult = await createShader(promptResult.prompt, modeResult.mode, claimed.row.id, refinement.value, deps);
  if (!shaderResult.ok) {
    if (modeResult.mode === 'openai') {
      await createProviderUsageService(deps).record({
        operationId,
        userId: authResult.user.id,
        feature: operationFeature,
        provider: deps.shaderProvider?.provider ?? 'openai',
        model: deps.shaderProvider?.defaultModel ?? 'gpt-5.5',
        status: 'failed',
        providerRequestId: shaderResult.providerRequestId,
        usage: shaderResult.usage,
      });
    }
    await deps.repositories.shaderRequests.markFailed(claimed.row.id, {
      ...shaderResult.failure,
      completedAt: deps.now?.() ?? new Date(),
    });
    if (operationId) {
      await createAccountAccessService(deps).release(operationId, 'failed', shaderResult.failure.code);
    }
    return errorJson(shaderResult.failure.status, shaderResult.failure.code, shaderResult.failure.message);
  }
  const attempt = modeResult.mode === 'localFallback' ? 'localFallback' : refinement.value ? 'refine' : 'initial';
  const responseBody: AiShaderGenerationResponse = {
    requestId: claimed.row.id,
    candidateRevision: 0,
    status: 'generated',
    attempt,
    prompt: promptResult.prompt,
    instance: {
      ...shaderResult.instance,
      definition: {
        ...shaderResult.instance.definition,
        provenance: {
          ...shaderResult.instance.definition.provenance,
          source: shaderResult.source,
          prompt: promptResult.prompt,
          ...(shaderResult.model ? { model: shaderResult.model } : {}),
          requestId: claimed.row.id,
          ...(refineReference.requestId ? { parentRequestId: refineReference.requestId } : {}),
          attempt,
        },
      },
    },
    source: shaderResult.source,
    ...(shaderResult.model ? { model: shaderResult.model } : {}),
  };
  if (modeResult.mode === 'openai') {
    await createProviderUsageService(deps).record({
      operationId,
      userId: authResult.user.id,
      feature: operationFeature,
      provider: 'openai',
      model: shaderResult.model ?? deps.shaderProvider?.defaultModel ?? 'gpt-5.5',
      status: 'succeeded',
      providerRequestId: shaderResult.providerRequestId,
      usage: shaderResult.usage,
    });
  }
  await deps.repositories.shaderRequests.markGenerated({
    id: claimed.row.id,
    responseJson: toJsonObject(responseBody),
    providerRequestId: shaderResult.providerRequestId,
    providerUsageJson: shaderResult.usage ? toJsonObject(shaderResult.usage) : null,
  });
  logInfo(refinement.value ? 'shader_refine_generated' : 'shader_generated', {
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
  refinement: { instance: AiShaderGenerationResponse['instance']; parentRequestId: string } | null,
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
  | {
      ok: false;
      failure: { status: number; code: string; message: string };
      providerRequestId?: string;
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    }
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
    const result = await deps.shaderProvider.generateShader({
      prompt,
      clientRequestId,
      ...(refinement ? { refine: { instance: refinement.instance, instruction: prompt } } : {}),
    });
    return {
      ok: true,
      source: 'openai',
      instance: {
        ...result.instance,
        definition: {
          ...result.instance.definition,
          provenance: {
            source: 'openai',
            prompt,
            model,
            ...(refinement ? { parentRequestId: refinement.parentRequestId, attempt: 'refine' as const } : {}),
          },
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
    return {
      ok: false,
      failure,
      ...(error instanceof OpenAiShaderResponseError ? { providerRequestId: error.requestId, usage: error.usage } : {}),
    };
  }
}

export async function handleValidateShaderRequest(
  request: RequestLike,
  requestId: string,
  body: ValidateAiShaderRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiShaderValidationResponse | { code: string; message: string }>> {
  const authResult = await authenticateCreateShader(request, deps);
  if (!authResult.ok) return authResult.response;
  const shaderRequest = await deps.repositories.shaderRequests.findByIdForUser(requestId, authResult.user.id);
  if (!shaderRequest) return errorJson(404, 'shader_request_not_found', 'Shader request not found.');
  if (
    (body?.candidateRevision !== 0 && body?.candidateRevision !== 1) ||
    body.candidateRevision !== shaderRequest.repair_count
  ) {
    return errorJson(409, 'shader_candidate_changed', 'A newer shader candidate is waiting for validation.');
  }

  if (body?.outcome === 'accepted') {
    if (shaderRequest.status === 'accepted') {
      if (shaderRequest.operation_id) await createAccountAccessService(deps).commit(shaderRequest.operation_id);
      return json(200, {
        requestId,
        candidateRevision: body.candidateRevision,
        status: 'accepted',
        repairAvailable: false,
      });
    }
    if (shaderRequest.status !== 'generated') {
      return errorJson(409, 'shader_validation_conflict', 'This shader is not waiting for browser validation.');
    }
    try {
      await deps.repositories.shaderRequests.markAccepted(
        requestId,
        body.candidateRevision,
        deps.now?.() ?? new Date(),
      );
      if (shaderRequest.operation_id) await createAccountAccessService(deps).commit(shaderRequest.operation_id);
    } catch {
      const current = await deps.repositories.shaderRequests.findByIdForUser(requestId, authResult.user.id);
      if (current?.status !== 'accepted' || current.repair_count !== body.candidateRevision) {
        return errorJson(409, 'shader_candidate_changed', 'A newer shader candidate was already resolved.');
      }
      if (current.operation_id) await createAccountAccessService(deps).commit(current.operation_id);
    }
    logInfo(shaderRequest.repair_count > 0 ? 'shader_repair_succeeded' : 'shader_accepted', {
      requestId,
      userId: authResult.user.id,
      repairCount: shaderRequest.repair_count,
      source: shaderRequest.mode,
    });
    return json(200, {
      requestId,
      candidateRevision: body.candidateRevision,
      status: 'accepted',
      repairAvailable: false,
    });
  }

  if (body?.outcome !== 'rejected') {
    return errorJson(400, 'invalid_shader_validation', 'Validation outcome must be accepted or rejected.');
  }
  const diagnostic = sanitizeCompilerDiagnostic(body.diagnostic);
  if (!diagnostic) {
    return errorJson(400, 'invalid_shader_diagnostic', 'A browser compiler diagnostic is required.');
  }
  if (shaderRequest.status === 'client_rejected') {
    return json(200, {
      requestId,
      candidateRevision: body.candidateRevision,
      status: 'client_rejected',
      repairAvailable: shaderRequest.repair_count === 0,
    });
  }
  if (shaderRequest.status === 'failed') {
    if (shaderRequest.operation_id) {
      await createAccountAccessService(deps).release(
        shaderRequest.operation_id,
        'failed',
        shaderRequest.error_code ?? 'shader_failed',
      );
    }
    return json(200, {
      requestId,
      candidateRevision: body.candidateRevision,
      status: 'failed',
      repairAvailable: false,
    });
  }
  if (shaderRequest.status !== 'generated') {
    return errorJson(409, 'shader_validation_conflict', 'This shader is not waiting for browser validation.');
  }
  const terminal = shaderRequest.mode !== 'openai' || shaderRequest.repair_count >= 1;
  try {
    await deps.repositories.shaderRequests.markClientRejected({
      id: requestId,
      candidateRevision: body.candidateRevision,
      diagnosticJson: toJsonObject(diagnostic),
      terminal,
      completedAt: deps.now?.() ?? new Date(),
    });
    if (terminal && shaderRequest.operation_id) {
      await createAccountAccessService(deps).release(
        shaderRequest.operation_id,
        'failed',
        'shader_browser_validation_failed',
      );
    }
  } catch {
    const current = await deps.repositories.shaderRequests.findByIdForUser(requestId, authResult.user.id);
    if (
      (current?.status !== 'client_rejected' && current?.status !== 'failed') ||
      current.repair_count !== body.candidateRevision
    ) {
      return errorJson(409, 'shader_candidate_changed', 'A newer shader candidate was already resolved.');
    }
    return json(200, {
      requestId,
      candidateRevision: body.candidateRevision,
      status: current.status,
      repairAvailable: current.status === 'client_rejected' && current.repair_count === 0,
    });
  }
  logWarn(terminal && shaderRequest.repair_count > 0 ? 'shader_repair_failed' : 'shader_compile_rejected', {
    requestId,
    userId: authResult.user.id,
    stage: diagnostic.stage,
    browser: diagnostic.browser,
    repairCount: shaderRequest.repair_count,
  });
  return json(200, {
    requestId,
    candidateRevision: body.candidateRevision,
    status: terminal ? 'failed' : 'client_rejected',
    repairAvailable: !terminal,
  });
}

export async function handleRepairShaderRequest(
  request: RequestLike,
  requestId: string,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiShaderGenerationResponse | { code: string; message: string }>> {
  const authResult = await authenticateCreateShader(request, deps);
  if (!authResult.ok) return authResult.response;
  const shaderRequest = await deps.repositories.shaderRequests.findByIdForUser(requestId, authResult.user.id);
  if (!shaderRequest) return errorJson(404, 'shader_request_not_found', 'Shader request not found.');
  if (shaderRequest.mode !== 'openai') {
    return errorJson(409, 'shader_repair_not_available', 'Local drafts are not repaired with OpenAI.');
  }
  if (
    shaderRequest.repair_count === 1 &&
    (shaderRequest.status === 'generated' || shaderRequest.status === 'accepted')
  ) {
    return storedGeneratedShaderResponse(shaderRequest);
  }
  if (shaderRequest.status === 'repairing') {
    return errorJson(409, 'shader_repair_in_progress', 'This shader is already being repaired.');
  }
  if (shaderRequest.status !== 'client_rejected' || shaderRequest.repair_count !== 0) {
    return errorJson(409, 'shader_repair_not_available', 'This shader cannot be repaired again.');
  }
  if (!deps.shaderProvider || !shaderRequest.response_json || !shaderRequest.compiler_diagnostic_json) {
    return errorJson(409, 'shader_repair_not_available', 'The failed shader details are unavailable.');
  }
  const budgetResponse = await safetyBudgetDenialResponse(deps);
  if (budgetResponse) return budgetResponse;
  const failedResponse = shaderRequest.response_json as unknown as AiShaderGenerationResponse;
  const failedInstance = normalizeShaderInstance(failedResponse.instance, `${requestId}-failed`);
  const diagnostic = sanitizeCompilerDiagnostic(shaderRequest.compiler_diagnostic_json);
  if (!failedInstance || !diagnostic) {
    return errorJson(409, 'shader_repair_not_available', 'The failed shader details are unavailable.');
  }

  try {
    await deps.repositories.shaderRequests.beginRepair(requestId);
  } catch {
    const current = await deps.repositories.shaderRequests.findByIdForUser(requestId, authResult.user.id);
    if (current?.repair_count === 1 && (current.status === 'generated' || current.status === 'accepted')) {
      return storedGeneratedShaderResponse(current);
    }
    if (current?.status === 'repairing') {
      return errorJson(409, 'shader_repair_in_progress', 'This shader is already being repaired.');
    }
    return errorJson(409, 'shader_repair_not_available', 'This shader cannot be repaired again.');
  }
  logInfo('shader_repairing', { requestId, userId: authResult.user.id, model: deps.shaderProvider.defaultModel });
  let providerUsageRecorded = false;
  try {
    const result = await deps.shaderProvider.generateShader({
      prompt: shaderRequest.prompt,
      clientRequestId: `${requestId}-repair`,
      repair: { instance: failedInstance, diagnostic },
    });
    const model = deps.shaderProvider.defaultModel;
    const repairedAttempt = failedResponse.attempt === 'refine' ? ('refineRepair' as const) : ('repair' as const);
    const instance = {
      ...result.instance,
      definition: {
        ...result.instance.definition,
        provenance: {
          source: 'openai' as const,
          prompt: shaderRequest.prompt,
          model,
          requestId,
          ...(failedInstance.definition.provenance?.parentRequestId
            ? { parentRequestId: failedInstance.definition.provenance.parentRequestId }
            : {}),
          attempt: repairedAttempt,
        },
      },
    };
    const responseBody: AiShaderGenerationResponse = {
      requestId,
      candidateRevision: 1,
      status: 'generated',
      attempt: repairedAttempt,
      prompt: shaderRequest.prompt,
      instance,
      source: 'openai',
      model,
    };
    await createProviderUsageService(deps).record({
      operationId: shaderRequest.operation_id,
      userId: authResult.user.id,
      feature: failedResponse.attempt === 'refine' ? 'shader_refine' : 'shader_create',
      provider: deps.shaderProvider.provider,
      model,
      status: 'succeeded',
      providerRequestId: result.requestId,
      usage: result.usage,
    });
    providerUsageRecorded = true;
    await deps.repositories.shaderRequests.completeRepair({
      id: requestId,
      responseJson: toJsonObject(responseBody),
      providerRequestId: result.requestId,
      providerUsageJson: result.usage
        ? toJsonObject({
            repairInputTokens: result.usage.inputTokens ?? null,
            repairOutputTokens: result.usage.outputTokens ?? null,
            repairTotalTokens: result.usage.totalTokens ?? null,
          })
        : null,
    });
    logInfo('shader_repair_generated', {
      requestId,
      userId: authResult.user.id,
      providerRequestId: result.requestId,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });
    return json(200, responseBody);
  } catch (error) {
    const timedOut = isOpenAiShaderTimeoutError(error);
    const failure = {
      status: timedOut ? 504 : 502,
      code: timedOut ? 'shader_provider_timeout' : 'shader_repair_failed',
      message: timedOut ? 'Shader repair took too long. Try again.' : 'The shader could not be repaired.',
    };
    if (!providerUsageRecorded) {
      await createProviderUsageService(deps).record({
        operationId: shaderRequest.operation_id,
        userId: authResult.user.id,
        feature: failedResponse.attempt === 'refine' ? 'shader_refine' : 'shader_create',
        provider: deps.shaderProvider.provider,
        model: deps.shaderProvider.defaultModel,
        status: 'failed',
        providerRequestId: error instanceof OpenAiShaderResponseError ? error.requestId : undefined,
        usage: error instanceof OpenAiShaderResponseError ? error.usage : undefined,
      });
    }
    await deps.repositories.shaderRequests.markFailed(requestId, {
      ...failure,
      completedAt: deps.now?.() ?? new Date(),
    });
    if (shaderRequest.operation_id) {
      await createAccountAccessService(deps).release(shaderRequest.operation_id, 'failed', failure.code);
    }
    logWarn('shader_repair_failed', {
      requestId,
      userId: authResult.user.id,
      reason: error instanceof Error ? error.message : 'unknown_error',
    });
    return errorJson(failure.status, failure.code, failure.message);
  }
}

function sanitizeCompilerDiagnostic(value: unknown): AiShaderCompilerDiagnostic | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const diagnostic = value as Record<string, unknown>;
  if (!['compile', 'link', 'runtime-contract', 'render'].includes(String(diagnostic.stage))) return null;
  if (typeof diagnostic.message !== 'string') return null;
  const message = Array.from(diagnostic.message, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!message) return null;
  const browser =
    typeof diagnostic.browser === 'string'
      ? diagnostic.browser
          .replace(/[^\x20-\x7e]/g, '')
          .trim()
          .slice(0, 160)
      : undefined;
  return {
    stage: diagnostic.stage as AiShaderCompilerDiagnostic['stage'],
    message: message.slice(0, AI_SHADER_DIAGNOSTIC_MAX_LENGTH),
    ...(browser ? { browser } : {}),
  };
}

function storedGeneratedShaderResponse(
  request: AiShaderRequestRow,
): JsonResponse<AiShaderGenerationResponse | { code: string; message: string }> {
  if (!request.response_json)
    return errorJson(500, 'shader_response_missing', 'The saved shader response is unavailable.');
  const body = request.response_json as unknown as AiShaderGenerationResponse;
  return json(200, {
    ...body,
    requestId: request.id,
    candidateRevision: request.repair_count === 0 ? 0 : 1,
    status: request.status === 'accepted' ? 'accepted' : 'generated',
    attempt: body.attempt,
  });
}

function storedShaderResponse(
  request: AiShaderRequestRow,
  prompt: string,
  mode: AiShaderRequestMode,
  parentRequestId: string | null,
): JsonResponse<AiShaderGenerationResponse | { code: string; message: string }> {
  if (request.prompt !== prompt || request.mode !== mode || request.parent_request_id !== parentRequestId) {
    return errorJson(409, 'idempotency_conflict', 'This request key was already used for another shader.');
  }
  if (request.status === 'pending' || request.status === 'repairing') {
    return errorJson(409, 'shader_request_in_progress', 'This shader is still being created. Try again shortly.');
  }
  if (request.status === 'client_rejected') {
    return errorJson(409, 'shader_repair_required', 'This shader needs one browser-guided repair.');
  }
  if (request.status === 'failed') {
    return errorJson(
      request.error_status ?? 502,
      request.error_code ?? 'shader_provider_failed',
      request.error_message ?? 'Shader generation failed. Try again.',
    );
  }
  if (!request.response_json)
    return errorJson(500, 'shader_response_missing', 'The saved shader response is unavailable.');
  logInfo('ai_shader.idempotency_hit', {
    requestId: request.id,
    userId: request.user_id,
    source: request.mode,
  });
  return storedGeneratedShaderResponse(request);
}

async function resolveShaderRefinement(requestId: string, userId: string, deps: AiRouteDeps) {
  const source = await deps.repositories.shaderRequests.findByIdForUser(requestId, userId);
  if (!source) {
    return {
      ok: false as const,
      response: errorJson(404, 'shader_refine_source_not_found', 'The shader to refine was not found.'),
    };
  }
  if (source.status !== 'accepted' || !source.response_json) {
    return {
      ok: false as const,
      response: errorJson(409, 'shader_refine_not_available', 'Only an accepted shader can be refined.'),
    };
  }
  const response = source.response_json as unknown as AiShaderGenerationResponse;
  const instance = normalizeShaderInstance(response.instance, `${requestId}-refine-source`);
  if (!instance) {
    return {
      ok: false as const,
      response: errorJson(409, 'shader_refine_not_available', 'The accepted shader definition is unavailable.'),
    };
  }
  return { ok: true as const, value: { instance, parentRequestId: requestId } };
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

function validateOptionalShaderRequestId(
  value: unknown,
): { ok: true; requestId: string | null } | { ok: false; code: 'invalid_shader_refine_source'; message: string } {
  if (value === undefined || value === null) return { ok: true, requestId: null };
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(value)) {
    return {
      ok: false,
      code: 'invalid_shader_refine_source',
      message: 'A valid accepted shader reference is required for refinement.',
    };
  }
  return { ok: true, requestId: value };
}

export async function handleCreateGenerationRequest(
  request: RequestLike,
  body: CreateGenerationRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiGenerationJobResponse | { code: string; message: string }>> {
  const prepared = await prepareCreateGeneration(request, body, deps);
  if (!prepared.ok) return prepared.response;

  const { provider, model, operationId, quotaCheck, user } = prepared;
  const created = await createGenerationJob(body, prepared, deps);
  if (!created.ok) {
    await createAccountAccessService(deps).release(operationId, 'failed', 'job_create_failed');
    return created.response;
  }

  const job = created.job;
  const enqueued = await enqueueGenerationJob(job, user.id, operationId, deps);
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
  operationId: string;
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
  if (!user || user.disabled_at) {
    logWarn('ai_shader.create_denied', { userId: auth.user.id, reason: 'account_disabled' });
    return { ok: false, response: errorJson(403, 'account_disabled', 'This account cannot start AI work.') };
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

  const budgetResponse = await safetyBudgetDenialResponse(deps);
  if (budgetResponse) return { ok: false, response: budgetResponse };

  const capacityResult = await ensureCreateGenerationCapacity(authResult.user.id, body.idempotencyKey, deps);
  if (!capacityResult.ok) return capacityResult;

  return {
    ok: true,
    model: requestResult.model,
    operationId: capacityResult.operationId,
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
  if (!user || user.disabled_at) {
    logWarn('ai_generation.create_denied', { userId: auth.user.id, reason: 'account_disabled' });
    return { ok: false, response: errorJson(403, 'account_disabled', 'This account cannot start AI work.') };
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
  try {
    priceProviderUsage({ provider, model, usage: {} });
  } catch {
    return {
      ok: false,
      response: errorJson(400, 'unsupported_provider_model', 'This provider model is not available.'),
    };
  }
  return { ok: true, provider, model };
}

async function ensureCreateGenerationCapacity(
  userId: string,
  idempotencyKey: string,
  deps: AiRouteDeps,
): Promise<
  | { ok: true; operationId: string; quotaCheck: MonthlyQuotaCheck }
  | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  const rateLimitResponse = createGenerationRateLimitResponse(userId, deps);
  if (rateLimitResponse) return { ok: false, response: rateLimitResponse };
  const reserved = await createAccountAccessService(deps).reserve({
    userId,
    feature: 'image_create',
    idempotencyKey,
  });
  if (!reserved.ok) return { ok: false, response: accountAccessDenialResponse(reserved.code, 'image') };
  const quotaCheck: MonthlyQuotaCheck = {
    allowed: true,
    quota: quotaFromAllowance(reserved.allowance),
  };

  return { ok: true, operationId: reserved.operation.id, quotaCheck };
}

async function existingGenerationResponse(userId: string, idempotencyKey: string, deps: AiRouteDeps) {
  const existing = await deps.repositories.jobs.findByIdempotencyKey(userId, idempotencyKey);
  if (!existing) return null;
  logInfo('ai_generation.idempotency_hit', { jobId: existing.id, userId, status: existing.status });
  const quota = quotaFromAllowance(await createAccountAccessService(deps).getAllowance(userId));
  return json(200, await toJobResponseForUser(existing, userId, deps.repositories, quota));
}

function createAccountAccessService(deps: AiRouteDeps) {
  return new AccountAccessService(deps.repositories, {
    now: deps.now,
    createId: deps.createOperationId,
  });
}

function createProviderUsageService(deps: AiRouteDeps) {
  return new ProviderUsageService(deps.repositories.usageEvents, {
    now: deps.now,
    createId: deps.createUsageId,
  });
}

function createSafetyBudgetService(deps: AiRouteDeps) {
  return deps.safetyBudget ?? new SafetyBudgetService(deps.repositories.usageEvents, { now: deps.now });
}

async function safetyBudgetDenialResponse(deps: AiRouteDeps) {
  const budget = await createSafetyBudgetService(deps).check();
  if (budget.snapshot.state === 'warning') {
    logWarn('ai_budget.warning', {
      period: budget.snapshot.period,
      spentMicroUsd: budget.snapshot.spentMicroUsd,
      limitMicroUsd: budget.snapshot.limitMicroUsd,
    });
  }
  return budget.allowed ? null : errorJson(503, 'ai_budget_exhausted', 'AI creation is temporarily unavailable.');
}

function quotaFromAllowance(allowance: AccountAllowanceSnapshot): AiQuotaSnapshot {
  return {
    period: allowance.period,
    limit: allowance.limit,
    used: allowance.committed + allowance.reserved,
    remaining: allowance.remaining,
  };
}

function accountAccessDenial(code: AccountAccessDenialCode, feature: 'image' | 'shader') {
  if (code === 'tier_ai_unavailable') {
    return { status: 403, code, message: `Your account tier cannot create AI ${feature}s.` };
  }
  if (code === 'allowance_exhausted') {
    return { status: 429, code, message: 'Monthly AI allowance used.' };
  }
  return { status: 409, code, message: 'Wait for the active AI operation to finish.' };
}

function accountAccessDenialResponse(code: AccountAccessDenialCode, feature: 'image' | 'shader') {
  const denial = accountAccessDenial(code, feature);
  return errorJson(denial.status, denial.code, denial.message);
}

function createGenerationRateLimitResponse(userId: string, deps: AiRouteDeps) {
  const rate = deps.createRateLimiter?.check(`ai:start:user:${userId}`);
  if (!rate || rate.allowed) return null;
  logWarn('ai_generation.create_denied', { userId, reason: 'rate_limited' });
  return json(
    429,
    { code: 'rate_limited', message: 'Too many generation requests.' },
    { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1000)) },
  );
}

function createShaderRateLimitResponse(userId: string, deps: AiRouteDeps) {
  const rate = deps.createRateLimiter?.check(`ai:start:user:${userId}`);
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
        operationId: prepared.operationId,
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
  operationId: string,
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
    await createAccountAccessService(deps).release(operationId, 'failed', 'queue_enqueue_failed');
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

  const cancelled = await deps.repositories.jobs.markCancelled(job.id, deps.now?.() ?? new Date());
  if (job.operation_id) await createAccountAccessService(deps).release(job.operation_id, 'cancelled', 'user_cancelled');

  return json(200, await toJobResponseForUser(cancelled, auth.user.id, deps.repositories));
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
