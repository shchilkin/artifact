import { randomUUID } from 'node:crypto';
import { AccountAccessService } from './accountAccessService.js';
import type { AiGenerationSettings, AiProvider, GenerationQueuePayload } from './contracts.js';
import type { ApiRepositories } from './db/repositories.js';
import type { AiGenerationJobRow, JsonObject, JsonValue } from './db/types.js';
import { logError, logInfo, logWarn } from './logger.js';
import { priceProviderUsage } from './providerPricing.js';
import type { ImageGenerationResult, ProviderRegistry } from './providers/index.js';
import { ProviderUsageService } from './providerUsageService.js';
import type { QueueJob } from './queue.js';
import { SafetyBudgetService } from './safetyBudgetService.js';
import { processShaderJob, type ShaderWorkerDeps } from './shaderWorker.js';
import type { AssetStorage } from './storage/index.js';

export interface GenerationWorkerDeps extends ShaderWorkerDeps {
  repositories: ApiRepositories;
  providers: ProviderRegistry;
  storage: AssetStorage;
  maxOutputBytes?: number;
  now?: () => Date;
  createId?: () => string;
  createUsageId?: () => string;
  safetyBudget?: SafetyBudgetService;
}

const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export async function processGenerationJob(
  queueJob: QueueJob<GenerationQueuePayload>,
  deps: GenerationWorkerDeps,
): Promise<void> {
  if (queueJob.data.kind === 'shader') {
    await processShaderJob(queueJob.data.requestId, queueJob.data.userId, deps);
    return;
  }
  const job = await deps.repositories.jobs.findByIdForUser(queueJob.data.jobId, queueJob.data.userId);
  if (!job || job.status !== 'queued') {
    logWarn('ai_generation.worker_skipped', {
      jobId: queueJob.data.jobId,
      userId: queueJob.data.userId,
      reason: job ? `status_${job.status}` : 'not_found',
    });
    return;
  }
  const access = new AccountAccessService(deps.repositories, { now: deps.now });
  const usage = new ProviderUsageService(deps.repositories.usageEvents, {
    now: deps.now,
    createId: deps.createUsageId,
  });

  try {
    await runGeneration(job, deps, access, usage);
  } catch (error) {
    await failGeneration(job, deps, access, error);
  }
}

async function runGeneration(
  job: AiGenerationJobRow,
  deps: GenerationWorkerDeps,
  access: AccountAccessService,
  usage: ProviderUsageService,
) {
  const running = await prepareGeneration(job, deps, access);
  const provider = deps.providers.get(running.provider as AiProvider);
  assertPricedProvider(provider.provider, running.model);
  await assertBudgetAvailable(deps);
  logProviderRequest(running, provider.provider);
  const result = await generateAndRecordUsage(running, provider, usage);
  validateProviderResult(result, deps.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
  await persistGeneration(running, result, deps, access);
}

async function prepareGeneration(job: AiGenerationJobRow, deps: GenerationWorkerDeps, access: AccountAccessService) {
  const running = await deps.repositories.jobs.markRunning(job.id, deps.now?.() ?? new Date());
  if (running.operation_id) await access.markRunning(running.operation_id);
  return running;
}

function assertPricedProvider(provider: string, model: string) {
  try {
    priceProviderUsage({ provider, model, usage: {} });
  } catch {
    throw new GenerationWorkerError(
      'unsupported_provider_model',
      'The queued provider model has no pricing contract.',
      false,
    );
  }
}

async function assertBudgetAvailable(deps: GenerationWorkerDeps) {
  const service = deps.safetyBudget ?? new SafetyBudgetService(deps.repositories.usageEvents, { now: deps.now });
  const budget = await service.check();
  if (budget.snapshot.state === 'warning') {
    logWarn('ai_budget.warning', {
      period: budget.snapshot.period,
      spentMicroUsd: budget.snapshot.spentMicroUsd,
      limitMicroUsd: budget.snapshot.limitMicroUsd,
    });
  }
  if (!budget.allowed) {
    throw new GenerationWorkerError('ai_budget_exhausted', 'AI creation is temporarily unavailable.', false);
  }
}

function logProviderRequest(running: AiGenerationJobRow, provider: string) {
  const context = { jobId: running.id, userId: running.user_id, provider, model: running.model };
  logInfo('ai_generation.running', context);
  logInfo('ai_generation.provider_request', context);
}

async function generateAndRecordUsage(
  running: AiGenerationJobRow,
  provider: ReturnType<ProviderRegistry['get']>,
  usage: ProviderUsageService,
) {
  try {
    const result = await provider.generateImage({
      jobId: running.id,
      userId: running.user_id,
      provider: provider.provider,
      model: running.model,
      prompt: running.prompt,
      settings: running.settings_json as unknown as AiGenerationSettings,
    });
    await usage.record({
      operationId: running.operation_id,
      userId: running.user_id,
      feature: 'image_create',
      provider: result.provider,
      model: result.model,
      status: 'succeeded',
      providerRequestId: result.usage?.providerRequestId,
      usage: result.usage?.metrics,
    });
    logInfo('ai_generation.provider_response', {
      jobId: running.id,
      provider: result.provider,
      model: result.model,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      sizeBytes: result.bytes.byteLength,
    });
    return result;
  } catch (error) {
    await recordFailedUsage(running, provider.provider, usage);
    throw error;
  }
}

async function recordFailedUsage(running: AiGenerationJobRow, provider: string, usage: ProviderUsageService) {
  await usage
    .record({
      operationId: running.operation_id,
      userId: running.user_id,
      feature: 'image_create',
      provider,
      model: running.model,
      status: 'failed',
    })
    .catch((error) => logError('ai_generation.usage_record_failed', error, { jobId: running.id }));
}

async function persistGeneration(
  running: AiGenerationJobRow,
  result: ImageGenerationResult,
  deps: GenerationWorkerDeps,
  access: AccountAccessService,
) {
  const assetId = deps.createId?.() ?? randomUUID();
  const stored = await deps.storage.writeImage({ assetId, bytes: result.bytes, mimeType: result.mimeType });
  logInfo('ai_generation.asset_written', {
    jobId: running.id,
    assetId,
    storageKey: stored.storageKey,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
  });
  try {
    const completedAt = deps.now?.() ?? new Date();
    await deps.repositories.assets.create({
      id: assetId,
      userId: running.user_id,
      kind: 'generated-image',
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      width: result.width,
      height: result.height,
      sizeBytes: stored.sizeBytes,
      metadataJson: createGeneratedAssetMetadata(running, result, completedAt),
    });
    await deps.repositories.jobs.markSucceeded(running.id, assetId, completedAt);
    if (running.operation_id) await commitUsableOperation(access, running.operation_id, running);
    logInfo('ai_generation.succeeded', { jobId: running.id, userId: running.user_id, assetId });
  } catch (error) {
    await deps.storage.deleteImage(stored.storageKey).catch(() => undefined);
    throw error;
  }
}

async function failGeneration(
  job: AiGenerationJobRow,
  deps: GenerationWorkerDeps,
  access: AccountAccessService,
  error: unknown,
) {
  const failure = classifyGenerationFailure(error);
  logError('ai_generation.failed', error, {
    jobId: job.id,
    userId: job.user_id,
    code: failure.code,
    retryable: failure.retryable,
  });
  await deps.repositories.jobs.markFailed(job.id, {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    providerUsageJson: null,
    estimatedCost: null,
  });
  if (job.operation_id) await access.release(job.operation_id, 'failed', failure.code);
}

async function commitUsableOperation(
  access: AccountAccessService,
  operationId: string,
  job: Pick<AiGenerationJobRow, 'id' | 'user_id'>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await access.commit(operationId);
      return;
    } catch (error) {
      lastError = error;
      logWarn('ai_generation.accounting_commit_retry', {
        jobId: job.id,
        userId: job.user_id,
        operationId,
        attempt,
      });
    }
  }
  logError('ai_generation.accounting_commit_failed', lastError, {
    jobId: job.id,
    userId: job.user_id,
    operationId,
  });
}

function validateProviderResult(result: ImageGenerationResult, maxOutputBytes: number) {
  if (!ALLOWED_MIME_TYPES.has(result.mimeType)) {
    throw new GenerationWorkerError(
      'invalid_provider_output',
      `Unsupported generated image mime type: ${result.mimeType}`,
    );
  }
  if (result.bytes.byteLength === 0) {
    throw new GenerationWorkerError('invalid_provider_output', 'Generated image output was empty.');
  }
  if (result.bytes.byteLength > maxOutputBytes) {
    throw new GenerationWorkerError(
      'invalid_provider_output',
      'Generated image output exceeded the configured size limit.',
    );
  }
  if (!Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width <= 0 || result.height <= 0) {
    throw new GenerationWorkerError('invalid_provider_output', 'Generated image dimensions were invalid.');
  }
}

class GenerationWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function classifyGenerationFailure(error: unknown) {
  if (error instanceof GenerationWorkerError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof Error && /storage|asset/i.test(error.message)) {
    return { code: 'asset_write_failed', message: error.message, retryable: true };
  }
  return {
    code: 'provider_error',
    message: error instanceof Error ? error.message : 'Image generation failed.',
    retryable: true,
  };
}

function createGeneratedAssetMetadata(
  job: AiGenerationJobRow,
  result: ImageGenerationResult,
  createdAt: Date,
): JsonObject {
  const metadata: JsonObject = {
    provider: job.provider,
    model: job.model,
    prompt: job.prompt,
    negativePrompt: job.negative_prompt,
    settings: job.settings_json,
    providerUsage: toJsonObject(result.usage?.metadata),
    licenseNote: 'Generated by the configured private Artifact provider adapter.',
    createdAt: createdAt.toISOString(),
  };
  if (result.usage?.estimatedCostUsd !== undefined) metadata.estimatedCostUsd = result.usage.estimatedCostUsd;
  return metadata;
}

function toJsonObject(value: Record<string, unknown> | undefined): JsonObject | null {
  if (!value) return null;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, toJsonValue(item)] as const)
      .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== undefined),
  );
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue).filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value === 'object') {
    return toJsonObject(value as Record<string, unknown>) ?? {};
  }
  return undefined;
}
