import { describe, expect, it, vi } from 'vitest';
import { AccountAccessService } from '../src/accountAccessService.js';
import type { RequestUserResolution } from '../src/auth.js';
import type { GenerationQueuePayload } from '../src/contracts.js';
import { ActiveGenerationJobExistsError } from '../src/db/errors.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import type { CreateUserInput } from '../src/db/types.js';
import { processGenerationJob } from '../src/generationWorker.js';
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
  handleGetShaderRequest,
  handleRepairShaderRequest,
  handleValidateShaderRequest,
} from '../src/routes/ai.js';

function createQueueSpy(processShaders = true) {
  let processor: ((job: QueueJob<GenerationQueuePayload>) => Promise<void>) | undefined;
  const enqueue = vi.fn(async (payload: GenerationQueuePayload): Promise<QueueJob<GenerationQueuePayload>> => {
    const job: QueueJob<GenerationQueuePayload> = {
      id: payload.kind === 'image' ? payload.jobId : payload.requestId,
      name: 'ai-generation',
      data: payload,
      attemptsMade: 0,
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      status: 'queued',
    };
    if (processShaders && payload.kind === 'shader') await processor?.(job);
    return job;
  });
  const queue: GenerationQueue = {
    enqueue,
    process: () => ({ close: async () => undefined }),
  };
  return { enqueue, queue, setProcessor: (next: typeof processor) => (processor = next) };
}

class AiRouteTestStore extends InMemoryApiStore {
  override seedUser(input: CreateUserInput) {
    const user = super.seedUser(input);
    if (input.aiEnabled) this.seedAccountAccess(input.id, 'creator');
    return user;
  }
}

function createDeps(
  auth: RequestUserResolution = { authenticated: true, user: { id: 'user-1' } },
  processShaders = true,
) {
  const store = new AiRouteTestStore();
  const { enqueue, queue, setProcessor } = createQueueSpy(processShaders);
  let nextId = 0;
  const deps: AiRouteDeps = {
    repositories: store.repositories(),
    queue,
    providers: createProviderRegistry([createMockImageProvider({ provider: 'openai' })]),
    resolveAuth: async () => auth,
    createRateLimiter: createInMemoryRateLimiter({ limit: 10, windowMs: 60_000, now: () => 0 }),
    now: () => new Date('2026-05-20T10:00:00.000Z'),
    createId: () => `job-${++nextId}`,
  };
  setProcessor((job) =>
    processGenerationJob(job, {
      repositories: deps.repositories,
      providers: deps.providers,
      shaderProvider: deps.shaderProvider,
      storage: {
        writeImage: vi.fn(),
        readImage: vi.fn(),
        deleteImage: vi.fn(),
      },
      now: deps.now,
    }),
  );
  return { deps, enqueue, store };
}

function createShaderDeps(label = 'Provider Shader', processShaders = true) {
  const result = createDeps({ authenticated: true, user: { id: 'user-1' } }, processShaders);
  result.store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
  const generateShader = vi.fn(async () => providerShader(label));
  result.deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
  return { ...result, generateShader };
}

function accountAccess(store: InMemoryApiStore) {
  return new AccountAccessService(store.repositories(), {
    now: () => new Date('2026-05-20T10:00:00.000Z'),
  });
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
  it('stops new provider work at the global safety budget before reserving quota', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', aiEnabled: true });
    await deps.repositories.usageEvents.append({
      id: 'budget-spend-1',
      userId: 'user-1',
      feature: 'shader_create',
      provider: 'openai',
      model: 'gpt-5.5',
      status: 'succeeded',
      usage: {},
      costMicroUsd: '30000000',
      pricingVersion: 'test-v1',
      createdAt: new Date('2026-05-20T09:00:00.000Z'),
    });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 503,
      body: { code: 'ai_budget_exhausted' },
    });
    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      body: { enabled: false, disabledReason: 'ai_budget_exhausted', providers: [] },
    });
    expect(enqueue).not.toHaveBeenCalled();
    await expect(
      deps.repositories.operations.findByIdempotencyKey('user-1', 'image_create', 'request-1'),
    ).resolves.toBeNull();
  });

  it('shares one start rate limit across image and shader generation', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', aiEnabled: true });
    const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    deps.createRateLimiter = limiter;

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 201,
    });
    expect(limiter.snapshot().get('ai:start:user:user-1')).toEqual({ count: 1, resetAt: 60_000 });

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'neon waves', idempotencyKey: 'shared-rate-shader-1' },
        deps,
      ),
    ).resolves.toMatchObject({
      status: 429,
      body: { code: 'rate_limited' },
    });
  });

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
        disabledReason: 'tier_ai_unavailable',
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
        quota: { period: '2026-05', limit: 20, used: 2, remaining: 18 },
      },
    });
  });

  it('keeps the tier denial for a Free account when the global budget is stopped', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'free-user' });
    store.seedUser({ id: 'spender' });
    await deps.repositories.usageEvents.append({
      id: 'budget-spend-free-test',
      userId: 'spender',
      feature: 'shader_create',
      provider: 'openai',
      model: 'gpt-5.5',
      status: 'succeeded',
      usage: {},
      costMicroUsd: '30000000',
      pricingVersion: 'test-v1',
      createdAt: new Date('2026-05-20T09:00:00.000Z'),
    });
    deps.resolveAuth = async () => ({ authenticated: true, user: { id: 'free-user' } });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      body: { enabled: false, disabledReason: 'tier_ai_unavailable' },
    });
  });

  it('rejects models without a pricing contract before queueing provider work', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', aiEnabled: true });

    await expect(
      handleCreateGenerationRequest({ headers: {} }, { ...createBody, model: 'future-unpriced-model' }, deps),
    ).resolves.toMatchObject({ status: 400, body: { code: 'unsupported_provider_model' } });
    expect(enqueue).not.toHaveBeenCalled();
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
    expect(enqueue).toHaveBeenCalledWith(
      { kind: 'shader', requestId: 'job-2', userId: 'user-1' },
      { jobId: 'shader-job-2-0', name: 'shader_create' },
    );
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
        requestId: 'job-1',
        status: 'generated',
        attempt: 'initial',
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

  it('returns owner-scoped shader status after queue processing', async () => {
    const { deps } = createShaderDeps('Queued Shader');

    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'queued waves', idempotencyKey: 'shader-status-1' },
      deps,
    );

    await expect(handleGetShaderRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 200,
      body: { requestId: 'job-1', status: 'generated', instance: { definition: { label: 'Queued Shader' } } },
    });
    deps.resolveAuth = async () => ({ authenticated: true, user: { id: 'user-2' } });
    await expect(handleGetShaderRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 404,
      body: { code: 'shader_request_not_found' },
    });
  });

  it('returns pending status until the shader worker processes the queued request', async () => {
    const { deps, enqueue, generateShader } = createShaderDeps('Queued Shader', false);

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'queued waves', idempotencyKey: 'shader-status-pending-1' },
        deps,
      ),
    ).resolves.toMatchObject({
      status: 202,
      body: { requestId: 'job-1', candidateRevision: 0, status: 'pending' },
    });
    expect(enqueue).toHaveBeenCalledWith(
      { kind: 'shader', requestId: 'job-1', userId: 'user-1' },
      { jobId: 'shader-job-1-0', name: 'shader_create' },
    );
    await expect(handleGetShaderRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 200,
      body: { requestId: 'job-1', candidateRevision: 0, status: 'pending' },
    });
    expect(generateShader).not.toHaveBeenCalled();
  });

  it('does not accept a generated shader until the browser validates it', async () => {
    const { deps, store } = createShaderDeps();
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'water refraction', idempotencyKey: 'shader-validation-1' },
      deps,
    );

    const generatedRequest = await store.findShaderByIdForUser('job-1', 'user-1');
    expect(generatedRequest).toMatchObject({ status: 'generated' });
    if (!generatedRequest?.operation_id) throw new Error('Expected generated shader operation.');
    await expect(store.findOperationById(generatedRequest.operation_id)).resolves.toMatchObject({
      status: 'awaiting_validation',
    });
    await expect(accountAccess(store).getAllowance('user-1')).resolves.toMatchObject({ committed: 0, reserved: 1 });
    await expect(
      handleValidateShaderRequest({ headers: {} }, 'job-1', { candidateRevision: 0, outcome: 'accepted' }, deps),
    ).resolves.toMatchObject({ status: 200, body: { status: 'accepted', repairAvailable: false } });
    await expect(store.findShaderByIdForUser('job-1', 'user-1')).resolves.toMatchObject({ status: 'accepted' });
    await expect(accountAccess(store).getAllowance('user-1')).resolves.toMatchObject({ committed: 1, reserved: 0 });
  });

  it('accepts new provider work while earlier shaders await browser validation', async () => {
    const { deps, store } = createShaderDeps();

    for (let index = 0; index < 4; index += 1) {
      await expect(
        handleCreateShaderRequest(
          { headers: {} },
          { prompt: `shader ${index}`, idempotencyKey: `shader-validation-wait-${index}` },
          deps,
        ),
      ).resolves.toMatchObject({ status: 200, body: { status: 'generated' } });
    }

    await expect(accountAccess(store).getAllowance('user-1')).resolves.toMatchObject({
      committed: 0,
      reserved: 4,
      remaining: 16,
    });
  });

  it('refines an owner accepted shader as a new quota-counted candidate', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const generateShader = vi
      .fn()
      .mockResolvedValueOnce(providerShader('Original Shader'))
      .mockResolvedValueOnce(providerShader('Refined Shader'));
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'water refraction', idempotencyKey: 'shader-original-1' },
      deps,
    );
    await handleValidateShaderRequest({ headers: {} }, 'job-1', { candidateRevision: 0, outcome: 'accepted' }, deps);

    const refined = await handleCreateShaderRequest(
      { headers: {} },
      {
        prompt: 'Use calmer waves and preserve more source detail.',
        idempotencyKey: 'shader-refine-1',
        refineFromRequestId: 'job-1',
      },
      deps,
    );

    expect(refined).toMatchObject({
      status: 200,
      body: {
        requestId: 'job-2',
        candidateRevision: 0,
        status: 'generated',
        attempt: 'refine',
        instance: {
          definition: {
            label: 'Refined Shader',
            provenance: { attempt: 'refine', parentRequestId: 'job-1' },
          },
        },
      },
    });
    expect(generateShader).toHaveBeenNthCalledWith(2, {
      prompt: 'Use calmer waves and preserve more source detail.',
      clientRequestId: 'job-2',
      refine: {
        instance: expect.objectContaining({
          definition: expect.objectContaining({ label: 'Original Shader' }),
        }),
        instruction: 'Use calmer waves and preserve more source detail.',
      },
    });
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(2);
  });

  it('does not refine a missing, unaccepted, or foreign shader request', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    store.seedUser({ id: 'user-2', email: 'other@example.com', aiEnabled: true });
    deps.shaderProvider = {
      provider: 'openai',
      defaultModel: 'gpt-5.5-mini',
      generateShader: vi.fn(async () => providerShader()),
    };
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'unaccepted shader', idempotencyKey: 'shader-unaccepted-1' },
      deps,
    );

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'refine it', idempotencyKey: 'shader-refine-blocked-1', refineFromRequestId: 'job-1' },
        deps,
      ),
    ).resolves.toMatchObject({ status: 409, body: { code: 'shader_refine_not_available' } });

    await handleValidateShaderRequest({ headers: {} }, 'job-1', { candidateRevision: 0, outcome: 'accepted' }, deps);
    deps.resolveAuth = async () => ({ authenticated: true, user: { id: 'user-2' } });
    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'refine it', idempotencyKey: 'shader-refine-foreign-1', refineFromRequestId: 'job-1' },
        deps,
      ),
    ).resolves.toMatchObject({ status: 404, body: { code: 'shader_refine_source_not_found' } });
  });

  it('repairs a rejected refinement while preserving refinement provenance', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const generateShader = vi
      .fn()
      .mockResolvedValueOnce(providerShader('Original Shader'))
      .mockResolvedValueOnce(providerShader('Broken Refinement'))
      .mockResolvedValueOnce(providerShader('Repaired Refinement'));
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'water refraction', idempotencyKey: 'shader-refine-repair-original' },
      deps,
    );
    await handleValidateShaderRequest({ headers: {} }, 'job-1', { candidateRevision: 0, outcome: 'accepted' }, deps);
    await handleCreateShaderRequest(
      { headers: {} },
      {
        prompt: 'Make it calmer',
        idempotencyKey: 'shader-refine-repair-candidate',
        refineFromRequestId: 'job-1',
      },
      deps,
    );
    await handleValidateShaderRequest(
      { headers: {} },
      'job-2',
      { candidateRevision: 0, outcome: 'rejected', diagnostic: { stage: 'render', message: 'flat output' } },
      deps,
    );

    await expect(handleRepairShaderRequest({ headers: {} }, 'job-2', deps)).resolves.toMatchObject({
      status: 200,
      body: {
        attempt: 'refineRepair',
        instance: {
          definition: {
            label: 'Repaired Refinement',
            provenance: { attempt: 'refineRepair', parentRequestId: 'job-1' },
          },
        },
      },
    });
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(2);
  });

  it('repairs one browser-rejected shader without consuming a second quota unit', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const generateShader = vi
      .fn()
      .mockResolvedValueOnce(providerShader('Broken Shader'))
      .mockResolvedValueOnce(providerShader('Repaired Shader'));
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'risograph treatment', idempotencyKey: 'shader-repair-1' },
      deps,
    );

    await expect(
      handleValidateShaderRequest(
        { headers: {} },
        'job-1',
        {
          candidateRevision: 0,
          outcome: 'rejected',
          diagnostic: { stage: 'compile', message: ' ERROR: 0:12: invalid token\nignored line ', browser: 'WebKit' },
        },
        deps,
      ),
    ).resolves.toMatchObject({ status: 200, body: { status: 'client_rejected', repairAvailable: true } });

    const repaired = await handleRepairShaderRequest({ headers: {} }, 'job-1', deps);
    expect(repaired).toMatchObject({
      status: 200,
      body: {
        requestId: 'job-1',
        status: 'generated',
        attempt: 'repair',
        instance: { definition: { label: 'Repaired Shader' } },
      },
    });
    expect(generateShader).toHaveBeenNthCalledWith(2, {
      prompt: 'risograph treatment',
      clientRequestId: 'job-1-repair',
      repair: {
        instance: expect.objectContaining({ definition: expect.objectContaining({ label: 'Broken Shader' }) }),
        diagnostic: { stage: 'compile', message: 'ERROR: 0:12: invalid token ignored line', browser: 'WebKit' },
      },
    });
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(1);

    await expect(
      handleValidateShaderRequest({ headers: {} }, 'job-1', { candidateRevision: 0, outcome: 'accepted' }, deps),
    ).resolves.toMatchObject({ status: 409, body: { code: 'shader_candidate_changed' } });
    await expect(store.findShaderByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'generated',
      repair_count: 1,
    });

    const repeated = await handleRepairShaderRequest({ headers: {} }, 'job-1', deps);
    expect(repeated).toEqual(repaired);
    expect(generateShader).toHaveBeenCalledTimes(2);
  });

  it('fails terminally when the repaired shader is rejected by the browser', async () => {
    const { deps, store } = createShaderDeps();
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'glass warp', idempotencyKey: 'shader-repair-terminal-1' },
      deps,
    );
    await handleValidateShaderRequest(
      { headers: {} },
      'job-1',
      { candidateRevision: 0, outcome: 'rejected', diagnostic: { stage: 'compile', message: 'first compile failure' } },
      deps,
    );
    await handleRepairShaderRequest({ headers: {} }, 'job-1', deps);

    await expect(
      handleValidateShaderRequest(
        { headers: {} },
        'job-1',
        { candidateRevision: 1, outcome: 'rejected', diagnostic: { stage: 'link', message: 'repair still fails' } },
        deps,
      ),
    ).resolves.toMatchObject({ status: 200, body: { status: 'failed', repairAvailable: false } });
    await expect(store.findShaderByIdForUser('job-1', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      repair_count: 1,
      error_code: 'shader_browser_validation_failed',
    });
    await expect(accountAccess(store).getAllowance('user-1')).resolves.toMatchObject({ committed: 0, reserved: 0 });
  });

  it('does not start two provider repairs for concurrent retries', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    let finishRepair: (() => void) | undefined;
    const generateShader = vi
      .fn()
      .mockResolvedValueOnce(providerShader('Broken Shader'))
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof providerShader>>((resolve) => {
            finishRepair = () => resolve(providerShader('Repaired Shader'));
          }),
      );
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'repair race', idempotencyKey: 'shader-repair-race-1' },
      deps,
    );
    await handleValidateShaderRequest(
      { headers: {} },
      'job-1',
      { candidateRevision: 0, outcome: 'rejected', diagnostic: { stage: 'compile', message: 'broken' } },
      deps,
    );

    const firstRepair = handleRepairShaderRequest({ headers: {} }, 'job-1', deps);
    await vi.waitFor(() => expect(generateShader).toHaveBeenCalledTimes(2));
    await expect(handleRepairShaderRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({
      status: 409,
      body: { code: 'shader_repair_in_progress' },
    });
    finishRepair?.();
    await expect(firstRepair).resolves.toMatchObject({ status: 200, body: { attempt: 'repair' } });
    expect(generateShader).toHaveBeenCalledTimes(2);
  });

  it('does not expose shader validation or repair requests owned by another user', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    store.seedUser({ id: 'user-2', email: 'other@example.com', aiEnabled: true });
    deps.shaderProvider = {
      provider: 'openai',
      defaultModel: 'gpt-5.5-mini',
      generateShader: vi.fn(async () => providerShader()),
    };
    await handleCreateShaderRequest(
      { headers: {} },
      { prompt: 'private shader', idempotencyKey: 'shader-owner-1' },
      deps,
    );
    deps.resolveAuth = async () => ({ authenticated: true, user: { id: 'user-2' } });

    await expect(
      handleValidateShaderRequest({ headers: {} }, 'job-1', { candidateRevision: 0, outcome: 'accepted' }, deps),
    ).resolves.toMatchObject({ status: 404 });
    await expect(handleRepairShaderRequest({ headers: {} }, 'job-1', deps)).resolves.toMatchObject({ status: 404 });
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
    const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    deps.createRateLimiter = limiter;
    const generateShader = vi.fn(async () => providerShader('One Result'));
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };
    const body = { prompt: 'invert softly', idempotencyKey: 'shader-idempotent-1' };

    const first = await handleCreateShaderRequest({ headers: {} }, body, deps);
    const second = await handleCreateShaderRequest({ headers: {} }, body, deps);

    expect(second).toEqual(first);
    expect(generateShader).toHaveBeenCalledTimes(1);
    expect(limiter.snapshot().get('ai:start:user:user-1')).toEqual({ count: 1, resetAt: 60_000 });
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
      status: 202,
      body: { status: 'pending', requestId: 'job-1' },
    });

    finishProvider?.();
    await expect(firstRequest).resolves.toMatchObject({ status: 200 });
    expect(generateShader).toHaveBeenCalledTimes(1);
  });

  it('allows three parallel Creator shaders and atomically blocks the fourth', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    const finishProviders: Array<() => void> = [];
    const generateShader = vi.fn(
      () =>
        new Promise<ReturnType<typeof providerShader>>((resolve) => {
          finishProviders.push(() => resolve(providerShader('Reserved Result')));
        }),
    );
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };

    const acceptedRequests = ['first', 'second', 'third'].map((label, index) =>
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: `${label} shader`, idempotencyKey: `shader-quota-race-${index + 1}` },
        deps,
      ),
    );
    await vi.waitFor(() => expect(generateShader).toHaveBeenCalledTimes(3));

    await expect(
      handleCreateShaderRequest(
        { headers: {} },
        { prompt: 'fourth shader', idempotencyKey: 'shader-quota-race-4' },
        deps,
      ),
    ).resolves.toMatchObject({ status: 409, body: { code: 'operation_in_progress' } });

    for (const finishProvider of finishProviders) finishProvider();
    await expect(Promise.all(acceptedRequests)).resolves.toHaveLength(3);
    expect(generateShader).toHaveBeenCalledTimes(3);
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(3);
  });

  it('does not call OpenAI after the monthly quota is exhausted', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 20,
      generationCountDelta: 20,
    });
    const generateShader = vi.fn();
    deps.shaderProvider = { provider: 'openai', defaultModel: 'gpt-5.5-mini', generateShader };

    await expect(
      handleCreateShaderRequest({ headers: {} }, { prompt: 'neon waves', idempotencyKey: 'shader-over-quota-1' }, deps),
    ).resolves.toMatchObject({ status: 429, body: { code: 'allowance_exhausted' } });
    expect(generateShader).not.toHaveBeenCalled();
  });

  it('returns a distinct timeout error and releases the provider-call reservation', async () => {
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
    await expect(store.countMonthlyGenerations('user-1', '2026-05')).resolves.toBe(0);
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
    const { deps, store } = createShaderDeps();
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 20,
      generationCountDelta: 20,
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
      generationLimit: 20,
      generationCountDelta: 20,
    });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: true,
        disabledReason: 'allowance_exhausted',
        enabled: false,
        quota: { period: '2026-05', limit: 20, used: 20, remaining: 0 },
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
        quota: { used: 1, remaining: 19 },
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      { kind: 'image', jobId: 'job-1', userId: 'user-1' },
      { jobId: 'job-1', name: 'image_create' },
    );
  });

  it('allows the final monthly generation and returns an exhausted quota snapshot', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 20,
      generationCountDelta: 19,
    });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 201,
      body: {
        id: 'job-1',
        quota: { period: '2026-05', limit: 20, used: 20, remaining: 0 },
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      { kind: 'image', jobId: 'job-1', userId: 'user-1' },
      { jobId: 'job-1', name: 'image_create' },
    );
  });

  it('rejects generation creation when the monthly quota is exhausted', async () => {
    const { deps, enqueue, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.upsertMonthlyUsage({
      userId: 'user-1',
      period: '2026-05',
      generationLimit: 20,
      generationCountDelta: 20,
    });

    await expect(handleCreateGenerationRequest({ headers: {} }, createBody, deps)).resolves.toMatchObject({
      status: 429,
      body: {
        code: 'allowance_exhausted',
        message: 'Monthly AI allowance used.',
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
        quota: { used: 1, remaining: 19 },
      },
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('allows multiple active image jobs within the Creator operation limit', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await handleCreateGenerationRequest({ headers: {} }, createBody, deps);

    await expect(
      handleCreateGenerationRequest({ headers: {} }, { ...createBody, idempotencyKey: 'request-2' }, deps),
    ).resolves.toMatchObject({
      status: 201,
      body: { id: 'job-2' },
    });
    await expect(store.countActiveJobs('user-1')).resolves.toBe(2);
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
    expect(enqueue).toHaveBeenCalledWith(
      { kind: 'image', jobId: 'job-1', userId: 'user-1' },
      { jobId: 'job-1', name: 'image_create' },
    );
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
    await expect(accountAccess(store).getAllowance('user-1')).resolves.toMatchObject({ committed: 0, reserved: 0 });
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
