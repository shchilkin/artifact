import { describe, expect, it, vi } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import type { GenerationQueuePayload } from '../src/contracts.js';
import { ActiveGenerationJobExistsError } from '../src/db/errors.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { createMockImageProvider, createProviderRegistry } from '../src/providers/index.js';
import type { GenerationQueue, QueueJob } from '../src/queue.js';
import { createInMemoryRateLimiter } from '../src/rateLimit.js';
import {
  type AiRouteDeps,
  handleAccessRequest,
  handleCancelGenerationRequest,
  handleCreateGenerationRequest,
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
  const deps: AiRouteDeps = {
    repositories: store.repositories(),
    queue,
    providers: createProviderRegistry([createMockImageProvider({ provider: 'openai' })]),
    resolveAuth: async () => auth,
    monthlyGenerationLimit: 10,
    maxActiveJobsPerUser: 1,
    createRateLimiter: createInMemoryRateLimiter({ limit: 10, windowMs: 60_000, now: () => 0 }),
    now: () => new Date('2026-05-20T10:00:00.000Z'),
    createId: () => 'job-1',
  };
  return { deps, enqueue, store };
}

const createBody = {
  prompt: 'grainy shoegaze album cover',
  provider: 'openai' as const,
  settings: { aspect: '1:1' as const, quality: 'standard' as const },
  idempotencyKey: 'request-1',
};

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
      user: { id: 'clerk-user-1', email: 'me@example.com' },
    });

    await expect(handleAccessRequest({ headers: {} }, deps)).resolves.toMatchObject({
      status: 200,
      body: {
        authenticated: true,
        disabledReason: 'not_enabled',
        enabled: false,
        user: { id: 'clerk-user-1', email: 'me@example.com' },
      },
    });
    await expect(store.findById('clerk-user-1')).resolves.toMatchObject({
      id: 'clerk-user-1',
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
