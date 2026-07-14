import type {
  AiOperationFeature,
  AiShaderCompilerDiagnostic,
  AiShaderGenerationResponse,
  ShaderInstance,
} from '@artifact/shared';
import { normalizeShaderInstance } from '@artifact/shared';
import { AccountAccessService } from './accountAccessService.js';
import type { ApiRepositories } from './db/repositories.js';
import type { AiShaderRequestRow, JsonObject } from './db/types.js';
import type { GenerationWorkerResult } from './generationWorkerResult.js';
import { logError, logInfo, logWarn } from './logger.js';
import {
  isOpenAiShaderTimeoutError,
  OpenAiShaderResponseError,
  type ShaderGenerationProvider,
} from './providers/index.js';
import { ProviderUsageService } from './providerUsageService.js';
import { SafetyBudgetService } from './safetyBudgetService.js';
import { generateLocalShaderInstanceFromPrompt } from './shaderGenerator.js';

export interface ShaderWorkerDeps {
  repositories: ApiRepositories;
  shaderProvider?: ShaderGenerationProvider;
  now?: () => Date;
  createUsageId?: () => string;
  safetyBudget?: SafetyBudgetService;
}

export async function processShaderJob(
  requestId: string,
  userId: string,
  deps: ShaderWorkerDeps,
): Promise<GenerationWorkerResult> {
  const request = await deps.repositories.shaderRequests.findByIdForUser(requestId, userId);
  if (!isProcessableRequest(request)) {
    logSkippedRequest(requestId, userId, request);
    return { status: 'skipped' };
  }

  const access = new AccountAccessService(deps.repositories, { now: deps.now });
  const usage = new ProviderUsageService(deps.repositories.usageEvents, {
    now: deps.now,
    createId: deps.createUsageId,
  });

  try {
    await runShaderJob(request, deps, access, usage);
    return { status: 'succeeded' };
  } catch (error) {
    const failure = await failShader(request, deps, access, usage, error);
    return { status: 'failed', code: failure.code };
  }
}

function isProcessableRequest(request: AiShaderRequestRow | null): request is AiShaderRequestRow {
  return request?.status === 'pending' || request?.status === 'repairing';
}

function logSkippedRequest(requestId: string, userId: string, request: AiShaderRequestRow | null) {
  logWarn('ai_shader.worker_skipped', {
    requestId,
    userId,
    reason: request ? `status_${request.status}` : 'not_found',
  });
}

async function runShaderJob(
  request: AiShaderRequestRow,
  deps: ShaderWorkerDeps,
  access: AccountAccessService,
  usage: ProviderUsageService,
) {
  if (request.operation_id) await access.markRunning(request.operation_id);
  if (request.mode === 'openai') await assertBudgetAvailable(deps);
  const generated =
    request.status === 'repairing' ? await repairShader(request, deps) : await createShader(request, deps);
  await recordSuccessfulUsage(request, generated, deps, usage);
  await persistGeneratedShader(request, generated, deps);
  if (request.operation_id) await access.markAwaitingValidation(request.operation_id);
  logInfo('ai_shader.worker_succeeded', {
    requestId: request.id,
    userId: request.user_id,
    attempt: generated.response.attempt,
    providerRequestId: generated.providerRequestId,
  });
}

async function recordSuccessfulUsage(
  request: AiShaderRequestRow,
  generated: ReturnType<typeof createResult>,
  deps: ShaderWorkerDeps,
  usage: ProviderUsageService,
) {
  if (request.mode !== 'openai') return;
  await usage.record({
    operationId: request.operation_id,
    userId: request.user_id,
    feature: shaderFeature(request),
    provider: deps.shaderProvider?.provider ?? 'openai',
    model: generated.model ?? deps.shaderProvider?.defaultModel ?? 'gpt-5.5',
    status: 'succeeded',
    providerRequestId: generated.providerRequestId,
    usage: generated.usage,
  });
}

async function persistGeneratedShader(
  request: AiShaderRequestRow,
  generated: ReturnType<typeof createResult>,
  deps: ShaderWorkerDeps,
) {
  const persistence = {
    id: request.id,
    responseJson: asJsonObject(generated.response),
    providerRequestId: generated.providerRequestId,
    providerUsageJson: generated.usage ? asJsonObject(generated.usage) : null,
  };
  if (request.status === 'repairing') await deps.repositories.shaderRequests.completeRepair(persistence);
  else await deps.repositories.shaderRequests.markGenerated(persistence);
}

async function createShader(request: AiShaderRequestRow, deps: ShaderWorkerDeps) {
  if (request.mode === 'localFallback') {
    const instance = generateLocalShaderInstanceFromPrompt(request.prompt);
    return createResult(request, instance, 'localFallback', instance.definition.provenance?.model);
  }

  const provider = requireProvider(deps);
  const refinement = request.parent_request_id ? await loadRefinement(request, deps.repositories) : null;
  const result = await provider.generateShader({
    prompt: request.prompt,
    clientRequestId: request.id,
    ...(refinement ? { refine: { instance: refinement, instruction: request.prompt } } : {}),
  });
  return createResult(
    request,
    result.instance,
    refinement ? 'refine' : 'initial',
    provider.defaultModel,
    result.requestId,
    result.usage,
  );
}

async function repairShader(request: AiShaderRequestRow, deps: ShaderWorkerDeps) {
  const provider = requireProvider(deps);
  const previous = parseStoredResponse(request);
  const instance = normalizeShaderInstance(previous.instance, `${request.id}-repair-source`);
  const diagnostic = parseDiagnostic(request.compiler_diagnostic_json);
  if (!instance || !diagnostic)
    throw new ShaderWorkerError('shader_repair_unavailable', 'Repair details are unavailable.');
  const result = await provider.generateShader({
    prompt: request.prompt,
    clientRequestId: `${request.id}-repair`,
    repair: { instance, diagnostic },
  });
  return createResult(
    request,
    result.instance,
    previous.attempt === 'refine' ? 'refineRepair' : 'repair',
    provider.defaultModel,
    result.requestId,
    result.usage,
  );
}

function createResult(
  request: AiShaderRequestRow,
  rawInstance: ShaderInstance,
  attempt: AiShaderGenerationResponse['attempt'],
  model?: string,
  providerRequestId?: string,
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
) {
  const source = request.mode === 'localFallback' ? ('localFallback' as const) : ('openai' as const);
  const instance: ShaderInstance = {
    ...rawInstance,
    definition: {
      ...rawInstance.definition,
      provenance: {
        ...rawInstance.definition.provenance,
        source,
        prompt: request.prompt,
        ...(model ? { model } : {}),
        requestId: request.id,
        ...(request.parent_request_id ? { parentRequestId: request.parent_request_id } : {}),
        attempt,
      },
    },
  };
  const response: AiShaderGenerationResponse = {
    requestId: request.id,
    candidateRevision: request.status === 'repairing' ? 1 : 0,
    status: 'generated',
    attempt,
    prompt: request.prompt,
    instance,
    source,
    ...(model ? { model } : {}),
  };
  return { response, model, providerRequestId, usage };
}

async function loadRefinement(request: AiShaderRequestRow, repositories: ApiRepositories) {
  const parent = await repositories.shaderRequests.findByIdForUser(request.parent_request_id ?? '', request.user_id);
  if (!parent || parent.status !== 'accepted') {
    throw new ShaderWorkerError('shader_refine_not_available', 'Only an accepted shader can be refined.');
  }
  const response = parseStoredResponse(parent);
  const instance = normalizeShaderInstance(response.instance, `${parent.id}-refine-source`);
  if (!instance) throw new ShaderWorkerError('shader_refine_not_available', 'The accepted shader is unavailable.');
  return instance;
}

function parseStoredResponse(request: AiShaderRequestRow): AiShaderGenerationResponse {
  if (!request.response_json)
    throw new ShaderWorkerError('shader_response_missing', 'The saved shader is unavailable.');
  return request.response_json as unknown as AiShaderGenerationResponse;
}

function parseDiagnostic(value: JsonObject | null): AiShaderCompilerDiagnostic | null {
  if (!value || typeof value.stage !== 'string' || typeof value.message !== 'string') return null;
  if (!['compile', 'link', 'runtime-contract', 'render'].includes(value.stage)) return null;
  return {
    stage: value.stage as AiShaderCompilerDiagnostic['stage'],
    message: value.message,
    ...(typeof value.browser === 'string' ? { browser: value.browser } : {}),
  };
}

function requireProvider(deps: ShaderWorkerDeps) {
  if (!deps.shaderProvider) {
    throw new ShaderWorkerError('shader_provider_unavailable', 'OpenAI shader generation is not configured.', 503);
  }
  return deps.shaderProvider;
}

async function assertBudgetAvailable(deps: ShaderWorkerDeps) {
  const budget = await (
    deps.safetyBudget ?? new SafetyBudgetService(deps.repositories.usageEvents, { now: deps.now })
  ).check();
  if (!budget.allowed)
    throw new ShaderWorkerError('ai_budget_exhausted', 'AI creation is temporarily unavailable.', 503);
}

function shaderFeature(request: AiShaderRequestRow): AiOperationFeature {
  return request.parent_request_id ? 'shader_refine' : 'shader_create';
}

async function failShader(
  request: AiShaderRequestRow,
  deps: ShaderWorkerDeps,
  access: AccountAccessService,
  usage: ProviderUsageService,
  error: unknown,
) {
  const failure = classifyFailure(error, request.status === 'repairing');
  await recordFailedUsage(request, deps, usage, error);
  await deps.repositories.shaderRequests.markFailed(request.id, {
    ...failure,
    completedAt: deps.now?.() ?? new Date(),
  });
  if (request.operation_id) await access.release(request.operation_id, 'failed', failure.code);
  logError('ai_shader.worker_failed', error, { requestId: request.id, userId: request.user_id, code: failure.code });
  return failure;
}

async function recordFailedUsage(
  request: AiShaderRequestRow,
  deps: ShaderWorkerDeps,
  usage: ProviderUsageService,
  error: unknown,
) {
  if (request.mode !== 'openai') return;
  const providerError = error instanceof OpenAiShaderResponseError ? error : null;
  await usage
    .record({
      operationId: request.operation_id,
      userId: request.user_id,
      feature: shaderFeature(request),
      provider: deps.shaderProvider?.provider ?? 'openai',
      model: deps.shaderProvider?.defaultModel ?? 'gpt-5.5',
      status: 'failed',
      providerRequestId: providerError?.requestId,
      usage: providerError?.usage,
    })
    .catch((usageError) => logError('ai_shader.usage_record_failed', usageError, { requestId: request.id }));
}

function classifyFailure(error: unknown, repair: boolean) {
  if (error instanceof ShaderWorkerError) return { status: error.status, code: error.code, message: error.message };
  if (isOpenAiShaderTimeoutError(error)) {
    return {
      status: 504,
      code: 'shader_provider_timeout',
      message: repair ? 'Shader repair took too long. Try again.' : 'Shader generation took too long. Try again.',
    };
  }
  return {
    status: 502,
    code: repair ? 'shader_repair_failed' : 'shader_provider_failed',
    message: repair ? 'The shader could not be repaired.' : 'Shader generation failed. Try again or adjust the prompt.',
  };
}

function asJsonObject(value: object): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

class ShaderWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
