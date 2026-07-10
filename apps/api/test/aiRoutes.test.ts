import { describe, expect, it, vi } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import type { GenerationQueuePayload } from '../src/contracts.js';
import { ActiveGenerationJobExistsError } from '../src/db/errors.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { createMockImageProvider, createProviderRegistry, OpenAiShaderTimeoutError } from '../src/providers/index.js';
import type { GenerationQueue, QueueJob } from '../src/queue.js';
import { createInMemoryRateLimiter } from '../src/rateLimit.js';
import {
  type AiRouteDeps,
  handleAccessRequest,
  handleAiRequest,
  handleCancelGenerationRequest,
  handleCreateGenerationRequest,
  handleCreateShaderRequest,
  handleGetGenerationRequest,
} from '../src/routes/ai.js';

function createQueueSpy() {
  const enqueue = vi.fn(
    async (payload: GenerationQueuePayload): Promise<QueueJob<GenerationQueuePayload>> => ({
      id: payload.jobId,
      name: 'ai-generation',
      data: payload,
      attemptsMade: 0,
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      status: 'queued',
    }),
  );
  const queue: GenerationQueue = {
    enqueue,
    process: () => ({ close: async () => undefined }),
  };
  return { enqueue, queue };
}

function createDeps(auth: RequestUserResolution = { authenticated: true, user: { id: 'user-1' } }) {
  const store = new InMemoryApiStore();
  const { enqueue, queue } = createQueueSpy();
  let nextId = 0;
  const deps: AiRouteDeps = {
    repositories: store.repositories(),
    queue,
    providers: createProviderRegistry([createMockImageProvider({ provider: 'openai' })]),
    resolveAuth: async () => auth,
    monthlyGenerationLimit: 10,
    maxActiveJobsPerUser: 1,
    createRateLimiter: createInMemoryRateLimiter({ limit: 10, windowMs: 60_000, now: () => 0 }),
    now: () => new Date('2026-05-20T10:00:00.000Z'),
    createId: () => `job-${++nextId}`,
  };
  return { deps, enqueue, store };
}

class ReadableStreamRequest implements AsyncIterable<Buffer> {
  readonly method = 'POST';
  readonly headers = {};

  private constructor(
    readonly url: string,
    private readonly body: Buffer,
  ) {}

  static fromJson(url: string, body: unknown) {
    return new ReadableStreamRequest(url, Buffer.from(JSON.stringify(body)));
  }

  async *[Symbol.asyncIterator]() {
    yield this.body;
  }
}

const createBody = {
  prompt: 'grainy shoegaze album cover',
  provider: 'openai' as const,
  settings: { aspect: '1:1' as const, quality: 'standard' as const },
  idempotencyKey: 'request-1',
};

function providerShader(label = 'Provider Shader') {
  return {
    instance: {
      definition: {
        version: 1 as const,
        id: 'provider-shader',
        label,
        language: 'glsl-fragment' as const,
        code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
        properties: [
          { key: 'amount', label: 'Amount', type: 'number' as const, default: 0.5, min: 0, max: 1, step: 0.01 },
        ],
      },
      values: { amount: 0.5 },
    },
  };
}

describe('AI route handlers', () => {
  it('returns anonymous access state without failing auth', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'missing_credentials' });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: false,
        disabledReason: 'anonymous',
        enabled: false,
      },
    });
  });

  it('returns invalid session state when bearer credentials are rejected', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'invalid_credentials' });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: false,
        disabledReason: 'invalid_session',
        enabled: false,
      },
    });
  });

  it('creates a disabled user record for a verified account on access check', async () => {
    const { deps, store } = createDeps({
      authenticated: true,
      user: { id: 'auth-user-1', email: 'me@example.com' },
    });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: true,
        disabledReason: 'not_enabled',
        enabled: false,
        user: { id: 'auth-user-1', email: 'me@example.com' },
      },
    });
    await expect(store.findById('auth-user-1')).resolves.toMatchObject({
      id: 'auth-user-1',
      email: 'me@example.com',
      ai_enabled: false,
      plus_status: 'none',
    });
  });

  it('returns enabled access state with quota for an AI-enabled user', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 10,
      generationCountDelta: 2,
    });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: true,
        enabled: true,
        quota: { period: '2026-05', limit: 10, used: 2, remaining: 8 },
      },
    });
  });

  it('requires a configured OpenAI shader provider by default', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'neon marble swirl with halftone ink texture', idempotencyKey: 'shader-unavailable-1' },
        deps,
      ),
    ).resolves.toMatchObject({
      status: 503,
      body: {
        code: 'shader_provider_unavailable',
        message: 'OpenAI shader generation is not configured.',
      },
    });
  });

  it('creates an explicit local fallback shader without queueing an image job', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'neon marble swirl with halftone ink texture', idempotencyKey: 'shader-openai-failed-1' },
      deps,
    );

    const response = await handleCreateShaderRequest(
      { headers: {} },
      {
        prompt: 'neon marble swirl with halftone ink texture',
        mode: 'localFallback',
        idempotencyKey: 'shader-local-1',
        fallbackForIdempotencyKey: 'shader-openai-failed-1',
      },
      deps,
    );

    expect(response).toMatchObject({
      status: 200,
      body: {
        prompt: 'neon marble swirl with halftone ink texture',
        source: 'localFallback',
        model: 'deterministic-local-shader',
        instance: {
          definition: {
            version: 1,
            language: 'glsl-fragment',
            provenance: {
              source: 'localFallback',
              prompt: 'neon marble swirl with halftone ink texture',
              model: 'deterministic-local-shader',
            },
          },
        },
      },
    });
    expect(response.status).toBe(200);
    if (!('instance' in response.body)) throw new Error('Expected shader response.');
    expect(response.body.instance.definition.code).toContain('texture2D(u_backdrop');
    expect(enqueue).not.toHaveBeenCalled();
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(0);
  });

  it('dispatches shader requests through the AI route table', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'ocean waves', idempotencyKey: 'shader-route-openai-failed' },
      deps,
    );
    const request = ReadableStreamRequest.fromJson('/api/ai/shaders', {
      prompt: 'ocean waves',
      mode: 'localFallback',
      idempotencyKey: 'shader-route-1',
      fallbackForIdempotencyKey: 'shader-route-openai-failed',
    });

    await expect(handleAiRequest(request, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        source: 'localFallback',
        instance: {
          definition: { version: 1, label: 'Local Water Effect' },
        },
      },
    });
  });

  it('uses a configured shader provider when available', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const shaderProvider = {
      provider: 'openai',
      defaultModel: 'gpt-5.5-mini',
      generateShader: vi.fn(async () => ({
        ...providerShader(),
        requestId: 'openai-request-1',
        usage: { inputTokens: 40, outputTokens: 80, totalTokens: 120 },
      })),
    } as const;
    deps.shaderProvider = shaderProvider;

    const response = await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'neon waves', idempotencyKey: 'shader-openai-1' },
      deps,
    );

    expect(response).toMatchObject({
      status: 200,
      body: {
        prompt: 'neon waves',
        source: 'openai',
        model: 'gpt-5.5-mini',
        instance: {
          definition: {
            label: 'Provider Shader',
            provenance: { source: 'openai', prompt: 'neon waves', model: 'gpt-5.5-mini' },
          },
        },
      },
    });
    expect(shaderProvider.generateShader).toHaveBeenCalledWith({
      prompt: 'neon waves',
      clientRequestId: 'job-1',
    });
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(1);
  });

  it('returns inspector-visible errors when the shader provider fails', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    deps.shaderProvider = {
      provider: 'openai',
      defaultModel: 'gpt-5.5-mini',
      generateShader: vi.fn(async () => {
        throw new Error('provider down');
      }),
    };

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: 'neon waves', idempotencyKey: 'shader-failed-1' }, deps),
    ).resolves.toMatchObject({
      status: 502,
      body: {
        code: 'shader_provider_failed',
        message: 'Shader generation failed. Try again or adjust the prompt.',
      },
    });
  });

  it('rejects shader generation for anonymous users', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'missing_credentials' });

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: 'neon waves', idempotencyKey: 'shader-anonymous-1' }, deps),
    ).resolves.toMatchObject({
      status: 401,
      body: { code: 'unauthenticated', message: 'Sign in before generating shaders.' },
    });
  });

  it('validates shader prompts before generation', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: '  ', idempotencyKey: 'shader-invalid-1' }, deps),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: 'invalid_prompt' },
    });
  });

  it('requires a printable idempotency key for shader generation', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: 'neon waves', idempotencyKey: 'bad key' }, deps),
    ).resolves.toMatchObject({ status: 400, body: { code: 'invalid_idempotency_key' } });
  });

  it('returns an idempotent OpenAI shader result without charging or calling the provider twice', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const generateShader = vi.fn(async () => providerShader('One Result'));
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    const body = { prompt: 'invert softly', idempotencyKey: 'shader-idempotent-1' };

    const first = await handleCreateShaderRequest({ headers: {} }, body, deps);
    const second = await handleCreateShaderRequest({ headers: {} }, body, deps);

    expect(second).toEqual(first);
    expect(generateShader).toHaveBeenCalledTimes(1);
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(1);
  });

  it('does not start a second provider call while the same shader request is pending', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    let finishProvider: (() => void) | undefined;
    const generateShader = vi.fn(
      () =>
        new Promise<ReturnType<typeof providerShader>>((resolve) => {
          finishProvider = () => resolve(providerShader('Pending Result'));
        }),
    );
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    const body = { prompt: 'invert softly', idempotencyKey: 'shader-pending-1' };

    const firstRequest = handleCreateShaderRequest({ headers: {} }, body, deps);
    await vi.waitFor(() => expect(generateShader).toHaveBeenCalledTimes(1));
    await expect(handleCreateShaderRequest({ headers: {} }, body, deps)).resolves.toMatchObject({
      status: 409,
      body: { code: 'shader_request_in_progress' },
    });

    finishProvider?.();
    await expect(firstRequest).resolves.toMatchObject({ status: 200 });
    expect(generateShader).toHaveBeenCalledTimes(1);
  });

  it('atomically blocks parallel shader requests at the monthly quota boundary', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    deps.monthlyGenerationLimit = 1;
    let finishProvider: (() => void) | undefined;
    const generateShader = vi.fn(
      () =>
        new Promise<ReturnType<typeof providerShader>>((resolve) => {
          finishProvider = () => resolve(providerShader('Reserved Result'));
        }),
    );
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };

    const firstRequest = handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'first shader', idempotencyKey: 'shader-quota-race-1' },
      deps,
    );
    await vi.waitFor(() => expect(generateShader).toHaveBeenCalledTimes(1));

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'second shader', idempotencyKey: 'shader-quota-race-2' },
        deps,
      ),
    ).resolves.toMatchObject({ status: 429, body: { code: 'quota_exceeded' } });

    finishProvider?.();
    await expect(firstRequest).resolves.toMatchObject({ status: 200 });
    expect(generateShader).toHaveBeenCalledTimes(1);
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(1);
  });

  it('does not call OpenAI after the monthly quota is exhausted', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 10,
      generationCountDelta: 10,
    });
    const generateShader = vi.fn();
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: 'neon waves', idempotencyKey: 'shader-over-quota-1' }, deps),
    ).resolves.toMatchObject({ status: 429, body: { code: 'quota_exceeded' } });
    expect(generateShader).not.toHaveBeenCalled();
  });

  it('returns a distinct timeout error and keeps the provider-call reservation', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    deps.shaderProvider = {
      provider: 'openai',
      defaultModel: 'gpt-5.5-mini',
      generateShader: vi.fn(async () => {
        throw new OpenAiShaderTimeoutError(100);
      }),
    };

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: 'slow water', idempotencyKey: 'shader-timeout-1' }, deps),
    ).resolves.toMatchObject({
      status: 504,
      body: { code: 'shader_provider_timeout', message: 'Shader generation took too long. Try again.' },
    });
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(1);
  });

  it('rejects local fallback requests without a failed OpenAI attempt', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        {
          prompt: 'ocean waves',
          mode: 'localFallback',
          idempotencyKey: 'shader-local-without-openai',
        },
        deps,
      ),
    ).resolves.toMatchObject({ status: 400, body: { code: 'invalid_fallback_reference' } });
  });

  it('does not authorize fallback when OpenAI was blocked before the provider call', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    deps.shaderProvider = {
      provider: 'openai',
      defaultModel: 'gpt-5.5-mini',
      generateShader: vi.fn(async () => providerShader()),
    };
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 10,
      generationCountDelta: 10,
    });
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'ocean waves', idempotencyKey: 'shader-quota-blocked' },
      deps,
    );

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        {
          prompt: 'ocean waves',
          mode: 'localFallback',
          idempotencyKey: 'shader-fallback-after-quota',
          fallbackForIdempotencyKey: 'shader-quota-blocked',
        },
        deps,
      ),
    ).resolves.toMatchObject({ status: 409, body: { code: 'fallback_not_available' } });
  });

  it('only authorizes fallback for the prompt that failed at the provider', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'ocean waves', idempotencyKey: 'shader-provider-failed-prompt' },
      deps,
    );

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        {
          prompt: 'neon marble',
          mode: 'localFallback',
          idempotencyKey: 'shader-fallback-other-prompt',
          fallbackForIdempotencyKey: 'shader-provider-failed-prompt',
        },
        deps,
      ),
    ).resolves.toMatchObject({ status: 409, body: { code: 'fallback_not_available' } });
  });

  it('returns exhausted quota access state for an AI-enabled user at the monthly limit', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 10,
      generationCountDelta: 10,
    });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: true,
        disabledReason: 'quota_exhausted',
        enabled: false,
        quota: { period: '2026-05', limit: 10, used: 10, remaining: 0 },
      },
    });
  });

  it('rejects generation creation for anonymous users', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'missing_credentials' });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 401,
      body: { code: 'unauthenticated' },
    });
  });

  it('creates and enqueues a generation job for enabled users', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 201,
      body: {
        id: 'job-1',
        status: 'queued',
        provider: 'openai',
        quota: { used: 1, remaining: 9 },
      },
    });
    expect(enqueue).toHaveBeenCalledWith({ jobId: 'job-1', userId: 'user-1' }, { jobId: 'job-1' });
  });

  it('allows the final monthly generation and returns an exhausted quota snapshot', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 10,
      generationCountDelta: 9,
    });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 201,
      body: {
        id: 'job-1',
        quota: { period: '2026-05', limit: 10, used: 10, remaining: 0 },
      },
    });
    expect(enqueue).toHaveBeenCalledWith({ jobId: 'job-1', userId: 'user-1' }, { jobId: 'job-1' });
  });

  it('rejects generation creation when the monthly quota is exhausted', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 10,
      generationCountDelta: 10,
    });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 429,
      body: {
        code: 'quota_exceeded',
        message: 'Monthly generation quota used.',
      },
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns existing idempotent jobs without consuming quota again', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        id: 'job-1',
        quota: { used: 1, remaining: 9 },
      },
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('blocks a second active non-idempotent job', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);

    await expect(
      handleCreateGenerationRequest({ headers: {} }, { ...createBody, idempotencyKey: 'request-2' }, deps),
    ).resolves.toMatchObject({
      status: 409,
      body: { code: 'active_job_exists' },
    });
  });

  it('maps repository active-job conflicts from concurrent creates', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    deps.repositories = {
      ...deps.repositories,
      jobs: {
        ...deps.repositories.jobs,
        countActiveJobs: async () => 0,
        create: async () => {
          throw new ActiveGenerationJobExistsError('user-1');
        },
      },
    };

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 409,
      body: { code: 'active_job_exists' },
    });
    expect(enqueue).not.toHaveBeenCalled();
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(0);
  });

  it('fails queued jobs and refunds quota when enqueue fails', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const enqueue = vi.fn(async () => {
      throw new Error('redis is down');
    });
    deps.queue = {
      enqueue,
      process: () => ({ close: async () => undefined }),
    };

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 503,
      body: { code: 'queue_unavailable' },
    });
    await expect(store.findGenerationJobByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      error_code: 'queue_enqueue_failed',
      retryable: true,
    });
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(0);
    await expect(store.countActiveJobs('user-1')).resolves.toBe(0);
    expect(enqueue).toHaveBeenCalledWith({ jobId: 'job-1', userId: 'user-1' }, { jobId: 'job-1' });
  });

  it('reads an existing generation job for the owner', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);

    await expect(handleGetGenerationRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 200,
      body: {
        id: 'job-1',
        status: 'queued',
        provider: 'openai',
      },
    });
  });

  it('includes generated asset metadata on completed generation jobs', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);
    await store.createAsset({
      id: 'asset-1',
      userId: 'user-1',
      kind: 'generated-image',
      storageKey: 'generated/asset-1.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      sizeBytes: 3,
      metadataJson: {
        provider: 'openai',
        model: 'mock-image',
        prompt: createBody.prompt,
        settings: createBody.settings,
        createdAt: '2026-05-20T10:00:00.000Z',
      },
    });
    await store.markSucceeded('job-1', 'asset-1', new Date('2026-05-20T10:01:00.000Z'));

    await expect(handleGetGenerationRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 200,
      body: {
        id: 'job-1',
        status: 'succeeded',
        asset: {
          id: 'asset-1',
          uri: '/api/assets/asset-1/file',
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
          sizeBytes: 3,
          metadata: {
            provider: 'openai',
            prompt: createBody.prompt,
          },
        },
      },
    });
  });

  it('cancels an active generation job', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);

    await expect(handleCancelGenerationRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 200,
      body: {
        id: 'job-1',
        status: 'cancelled',
        completedAt: '2026-05-20T10:00:00.000Z',
      },
    });
  });

  it('rejects cancellation after a generation is no longer active', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);
    await handleCancelGenerationRequest({ headers: {} }, 'job-1', deps);

    await expect(handleCancelGenerationRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 409,
      body: { code: 'invalid_job_state' },
    });
  });

  it('returns not found for missing generation jobs', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });

    await expect(handleGetGenerationRequest({ headers: {} }, 'missing-job', deps)).resolves.toMatchObject({
      status: 404,
      body: { code: 'not_found' },
    });
  });
});
