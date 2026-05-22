import { randomUUID } from 'node:crypto';
import type { AiGenerationSettings, AiProvider, GenerationQueuePayload } from './contracts.js';
import type { ApiRepositories } from './db/repositories.js';
import type { AiGenerationJobRow, JsonObject, JsonValue } from './db/types.js';
import { logError, logInfo, logWarn } from './logger.js';
import type { ImageGenerationResult, ProviderRegistry } from './providers/index.js';
import type { QueueJob } from './queue.js';
import type { AssetStorage } from './storage/index.js';

export interface GenerationWorkerDeps {
  repositories: ApiRepositories;
  providers: ProviderRegistry;
  storage: AssetStorage;
  maxOutputBytes?: number;
  now?: () => Date;
  createId?: () => string;
}

const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export async function processGenerationJob(
  queueJob: QueueJob<GenerationQueuePayload>,
  deps: GenerationWorkerDeps,
): Promise<void> {
  const job = await deps.repositories.jobs.findByIdForUser(queueJob.data.jobId, queueJob.data.userId);
  if (!job || job.status !== 'queued') {
    logWarn('ai_generation.worker_skipped', {
      jobId: queueJob.data.jobId,
      userId: queueJob.data.userId,
      reason: job ? `status_${job.status}` : 'not_found',
    });
    return;
  }
  let storedStorageKey: string | null = null;

  try {
    const running = await deps.repositories.jobs.markRunning(job.id, deps.now?.() ?? new Date());
    const provider = deps.providers.get(running.provider as AiProvider);
    logInfo('ai_generation.running', {
      jobId: running.id,
      userId: running.user_id,
      provider: provider.provider,
      model: running.model,
    });
    logInfo('ai_generation.provider_request', {
      jobId: running.id,
      provider: provider.provider,
      model: running.model,
    });
    const result = await provider.generateImage({
      jobId: running.id,
      userId: running.user_id,
      provider: provider.provider,
      model: running.model,
      prompt: running.prompt,
      settings: running.settings_json as unknown as AiGenerationSettings,
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
    validateProviderResult(result, deps.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
    const assetId = deps.createId?.() ?? randomUUID();
    const stored = await deps.storage.writeImage({
      assetId,
      bytes: result.bytes,
      mimeType: result.mimeType,
    });
    storedStorageKey = stored.storageKey;
    logInfo('ai_generation.asset_written', {
      jobId: running.id,
      assetId,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    });
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
    logInfo('ai_generation.succeeded', { jobId: running.id, userId: running.user_id, assetId });
  } catch (error) {
    if (storedStorageKey) {
      await deps.storage.deleteImage(storedStorageKey).catch(() => undefined);
    }
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
  }
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
