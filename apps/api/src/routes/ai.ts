import { randomUUID } from 'node:crypto';
import { computeAiAccessResponse, type RequestLike, type RequestUserResolution } from '../auth.js';
import type {
  AiAccessResponse,
  AiGenerationAssetResponse,
  AiGenerationJobResponse,
  AiGenerationSettings,
  AiProvider,
  CreateGenerationRequest,
} from '../contracts.js';
import { AI_API_PATHS, AI_PROVIDERS } from '../contracts.js';
import type { ApiRepositories } from '../db/repositories.js';
import type { AiGenerationJobRow, AssetRow, JsonObject } from '../db/types.js';
import { errorJson, type JsonResponse, json, readJsonBody } from '../http.js';
import type { ProviderRegistry } from '../providers/index.js';
import type { GenerationQueue } from '../queue.js';
import { checkMonthlyQuota, checkOneActiveJob, createQuotaSnapshot, getMonthlyQuotaPeriod } from '../quota.js';
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
  now?: () => Date;
  createId?: () => string;
}

export async function handleAiRequest(
  request: AiRouteRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiAccessResponse | AiGenerationJobResponse | { code: string; message: string }> | null> {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;

  if (method === 'GET' && pathname === '/api/ai/access') {
    return handleAccessRequest(request, deps);
  }

  if (method === 'POST' && pathname === '/api/ai/generations') {
    let body: CreateGenerationRequest;
    try {
      body = await readJsonBody<CreateGenerationRequest>(request);
    } catch {
      return errorJson(400, 'invalid_json', 'Request body must be valid JSON.');
    }
    return handleCreateGenerationRequest(request, body, deps);
  }

  const generationMatch = /^\/api\/ai\/generations\/([^/]+)$/.exec(pathname);
  if (generationMatch?.[1] && method === 'GET') {
    return handleGetGenerationRequest(request, decodeURIComponent(generationMatch[1]), deps);
  }

  const cancelMatch = /^\/api\/ai\/generations\/([^/]+)\/cancel$/.exec(pathname);
  if (cancelMatch?.[1] && method === 'POST') {
    return handleCancelGenerationRequest(request, decodeURIComponent(cancelMatch[1]), deps);
  }

  return null;
}

export async function handleAccessRequest(
  request: RequestLike,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiAccessResponse>> {
  const auth = await deps.resolveAuth(request);
  const user = auth.authenticated ? await deps.repositories.users.findById(auth.user.id) : null;
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

export async function handleCreateGenerationRequest(
  request: RequestLike,
  body: CreateGenerationRequest,
  deps: AiRouteDeps,
): Promise<JsonResponse<AiGenerationJobResponse | { code: string; message: string }>> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) return errorJson(401, 'unauthenticated', 'Sign in before generating images.');

  const user = await deps.repositories.users.findById(auth.user.id);
  if (!user?.ai_enabled || user.disabled_at) {
    return errorJson(403, 'not_enabled', 'AI generation is not enabled for this user.');
  }

  const requestCheck = validateCreateGenerationRequest(body);
  if (!requestCheck.ok) return errorJson(400, requestCheck.code, requestCheck.message);

  const provider = requestCheck.provider;
  const providerAdapter = deps.providers.get(provider);
  const model = body.model?.trim() || providerAdapter.defaultModel;
  const existing = await deps.repositories.jobs.findByIdempotencyKey(user.id, body.idempotencyKey);
  if (existing) {
    const period = getMonthlyQuotaPeriod(deps.now?.());
    const quota = createQuotaSnapshot(
      period,
      deps.monthlyGenerationLimit,
      await deps.repositories.usage.countMonthlyGenerations(user.id, period),
    );
    return json(200, await toJobResponseForUser(existing, user.id, deps.repositories, quota));
  }

  const rate = deps.createRateLimiter?.check(`generation:create:user:${user.id}`);
  if (rate && !rate.allowed) {
    return json(
      429,
      { code: 'rate_limited', message: 'Too many generation requests.' },
      { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1000)) },
    );
  }

  const quotaCheck = await checkMonthlyQuota({
    limit: deps.monthlyGenerationLimit,
    usageReader: deps.repositories.usage,
    userId: user.id,
    now: deps.now?.(),
  });
  if (!quotaCheck.allowed) return errorJson(429, 'quota_exceeded', 'Monthly generation quota used.');

  const activeCheck = await checkOneActiveJob({
    activeJobReader: deps.repositories.jobs,
    maxActiveJobs: deps.maxActiveJobsPerUser,
    userId: user.id,
  });
  if (!activeCheck.allowed) {
    return errorJson(409, 'active_job_exists', 'Wait for the active generation job to finish.');
  }

  const job = await deps.repositories.jobs.create({
    id: deps.createId?.() ?? randomUUID(),
    userId: user.id,
    provider,
    model,
    prompt: body.prompt.trim(),
    negativePrompt: body.settings.negativePrompt,
    settingsJson: settingsToJson(body.settings),
    idempotencyKey: body.idempotencyKey,
  });
  await deps.repositories.usage.upsertMonthlyUsage({
    userId: user.id,
    period: quotaCheck.quota.period,
    generationLimit: deps.monthlyGenerationLimit,
    generationCountDelta: 1,
  });
  await deps.queue.enqueue({ jobId: job.id, userId: user.id }, { jobId: job.id });

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
  if (!body || typeof body !== 'object')
    return { ok: false, code: 'invalid_settings', message: 'Request body is required.' };
  if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return { ok: false, code: 'invalid_prompt', message: 'Prompt is required.' };
  }
  if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length === 0) {
    return { ok: false, code: 'invalid_settings', message: 'Idempotency key is required.' };
  }
  if (!isGenerationSettings(body.settings)) {
    return { ok: false, code: 'invalid_settings', message: 'Generation settings are invalid.' };
  }
  const provider = body.provider ?? 'openai';
  if (!AI_PROVIDERS.includes(provider)) {
    return { ok: false, code: 'unsupported_provider', message: 'Generation provider is not supported.' };
  }
  return { ok: true, provider };
}

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
