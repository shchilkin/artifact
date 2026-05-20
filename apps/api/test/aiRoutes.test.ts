import { describe, expect, it, vi } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import type { GenerationQueuePayload } from '../src/contracts.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { createMockImageProvider, createProviderRegistry } from '../src/providers/index.js';
import type { GenerationQueue, QueueJob } from '../src/queue.js';
import { createInMemoryRateLimiter } from '../src/rateLimit.js';
import { type AiRouteDeps, handleAccessRequest, handleCreateGenerationRequest } from '../src/routes/ai.js';

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
});
