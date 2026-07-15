import { describe, expect, it } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { handleAdminRequest } from '../src/routes/admin.js';
import { SafetyBudgetService } from '../src/safetyBudgetService.js';

function request(url: string) {
  return { method: 'GET', url, headers: {} };
}

function postRequest(url: string, body: unknown) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    method: 'POST',
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

function deps(
  store: InMemoryApiStore,
  auth: RequestUserResolution,
  createId?: () => string,
  now = () => new Date('2026-07-12T12:00:00.000Z'),
) {
  const repositories = store.repositories();
  return {
    repositories,
    safetyBudget: new SafetyBudgetService(repositories.usageEvents, {
      now,
    }),
    resolveAuth: async () => auth,
    createId,
    now,
  };
}

async function seededStore() {
  const store = new InMemoryApiStore();
  store.seedUser({ id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  store.seedUser({ id: 'creator-1', email: 'creator@example.com' });
  store.seedUser({ id: 'free-1', email: 'free@example.com' });
  store.seedAccountAccess('admin-1', 'founder');
  store.seedAccountAccess('creator-1', 'creator');
  await store.repositories().usageEvents.append({
    id: 'usage-1',
    userId: 'creator-1',
    feature: 'shader_create',
    provider: 'openai',
    model: 'gpt-5.5',
    status: 'succeeded',
    providerRequestId: 'provider-request-1',
    usage: { inputTokens: 120, outputTokens: 340 },
    costMicroUsd: '10800',
    pricingVersion: 'openai-2026-07-12',
    createdAt: new Date('2026-07-12T10:00:00.000Z'),
  });
  await store.repositories().reconciliations.upsert({
    id: 'reconciliation-1',
    provider: 'openai',
    usageDate: '2026-07-11',
    status: 'succeeded',
    providerCostMicroUsd: '11000',
    internalCostMicroUsd: '10800',
  });
  return store;
}

async function seedReconcilableOperations(store: InMemoryApiStore) {
  const repositories = store.repositories();
  await repositories.operations.reserve({
    id: 'operation-recoverable',
    userId: 'creator-1',
    feature: 'image_create',
    idempotencyKey: 'recoverable-image',
    reservationPeriod: '2026-07',
    reservedGenerations: 1,
    generationLimit: 20,
    maxActiveOperations: 3,
  });
  await repositories.jobs.create({
    id: 'job-recoverable',
    operationId: 'operation-recoverable',
    userId: 'creator-1',
    provider: 'openai',
    model: 'gpt-image-2',
    prompt: 'omitted',
    settingsJson: {},
    idempotencyKey: 'recoverable-image',
  });
  await repositories.jobs.markSucceeded('job-recoverable', 'asset-recoverable', new Date('2026-07-12T10:00:00.000Z'));

  await repositories.operations.reserve({
    id: 'operation-expirable',
    userId: 'creator-1',
    feature: 'shader_create',
    idempotencyKey: 'expirable-shader',
    reservationPeriod: '2026-07',
    reservedGenerations: 1,
    generationLimit: 20,
    maxActiveOperations: 3,
  });
  await repositories.operations.markRunning('operation-expirable', new Date('2026-07-11T01:00:00.000Z'));
}

const adminAuth: RequestUserResolution = {
  authenticated: true,
  user: { id: 'admin-1', email: 'admin@example.com' },
};

describe('Admin API read routes', () => {
  it('requires an authenticated persisted Admin for every admin read', async () => {
    const store = await seededStore();
    await expect(
      handleAdminRequest(
        request('/api/admin/overview'),
        deps(store, { authenticated: false, reason: 'missing_credentials' }),
      ),
    ).resolves.toMatchObject({ status: 401, body: { code: 'admin_auth_required' } });
    await expect(
      handleAdminRequest(
        request('/api/admin/overview'),
        deps(store, { authenticated: true, user: { id: 'creator-1' } }),
      ),
    ).resolves.toMatchObject({ status: 403, body: { code: 'admin_access_denied' } });
  });

  it('returns overview totals without Creative Content', async () => {
    const store = await seededStore();
    const response = await handleAdminRequest(request('/api/admin/overview?period=2026-07'), deps(store, adminAuth));

    expect(response).toMatchObject({
      status: 200,
      body: {
        accounts: { free: 1, creator: 1, founder: 1, total: 3 },
        providerUsage: { costMicroUsd: '10800', inputTokens: '120', outputTokens: '340', failedCalls: 0 },
        safetyBudget: { state: 'normal' },
      },
    });
    expect(JSON.stringify(response?.body)).not.toMatch(/prompt|shader.*code|asset|project/i);
  });

  it('searches and paginates accounts with current-month usage', async () => {
    const store = await seededStore();
    const response = await handleAdminRequest(
      request('/api/admin/accounts?period=2026-07&q=creator&limit=1&offset=0'),
      deps(store, adminAuth),
    );

    expect(response).toMatchObject({
      status: 200,
      body: {
        accounts: [
          {
            id: 'creator-1',
            tier: 'creator',
            providerCostMicroUsd: '10800',
          },
        ],
        page: { limit: 1, offset: 0, total: 1, hasMore: false },
      },
    });
  });

  it('returns a client error for an invalid UTC period', async () => {
    const store = await seededStore();
    await expect(
      handleAdminRequest(request('/api/admin/overview?period=July'), deps(store, adminAuth)),
    ).resolves.toMatchObject({ status: 400, body: { code: 'invalid_request', message: 'Period must use YYYY-MM.' } });
  });

  it('returns account metadata and audit collections but not Creative Content', async () => {
    const store = await seededStore();
    const response = await handleAdminRequest(
      request('/api/admin/accounts/creator-1?period=2026-07'),
      deps(store, adminAuth),
    );

    expect(response).toMatchObject({ status: 200, body: { account: { id: 'creator-1', tier: 'creator' } } });
    expect(response?.body).toHaveProperty('tierAssignments');
    expect(response?.body).toHaveProperty('quotaGrants');
    expect(response?.body).toHaveProperty('audit');
    expect(JSON.stringify(response?.body)).not.toMatch(/prompt|shader.*code|asset|project/i);
  });

  it('filters provider usage and lists reconciliation metadata', async () => {
    const store = await seededStore();
    const usage = await handleAdminRequest(
      request('/api/admin/usage?userId=creator-1&provider=openai&status=succeeded'),
      deps(store, adminAuth),
    );
    const reconciliations = await handleAdminRequest(
      request('/api/admin/reconciliations?limit=10'),
      deps(store, adminAuth),
    );

    expect(usage).toMatchObject({
      status: 200,
      body: { usage: [{ id: 'usage-1', model: 'gpt-5.5', costMicroUsd: '10800' }] },
    });
    expect(reconciliations).toMatchObject({
      status: 200,
      body: { reconciliations: [{ id: 'reconciliation-1', providerCostMicroUsd: '11000' }] },
    });
  });

  it('previews recoverable and stale AI operations without mutating them', async () => {
    const store = await seededStore();
    await seedReconcilableOperations(store);

    const response = await handleAdminRequest(
      request('/api/admin/ai-operations/reconciliation'),
      deps(store, adminAuth),
    );

    expect(response).toMatchObject({
      status: 200,
      body: {
        mode: 'preview',
        repeated: false,
        checkedAt: '2026-07-12T12:00:00.000Z',
        staleBefore: '2026-07-12T06:00:00.000Z',
        recoveredOperationIds: ['operation-recoverable'],
        expiredOperationIds: ['operation-expirable'],
      },
    });
    await expect(store.repositories().operations.findById('operation-recoverable')).resolves.toMatchObject({
      status: 'reserved',
    });
    await expect(store.repositories().operations.findById('operation-expirable')).resolves.toMatchObject({
      status: 'running',
    });
  });

  it('applies operation recovery once and rate-limits a different immediate retry', async () => {
    const store = await seededStore();
    await seedReconcilableOperations(store);
    const body = { reason: 'Recover completed production work', idempotencyKey: 'operation-recovery-1' };
    const first = await handleAdminRequest(
      postRequest('/api/admin/ai-operations/reconciliation', body),
      deps(store, adminAuth, () => 'reconciliation-audit-1'),
    );
    const retry = await handleAdminRequest(
      postRequest('/api/admin/ai-operations/reconciliation', body),
      deps(store, adminAuth, () => 'reconciliation-audit-retry'),
    );
    const tooSoon = await handleAdminRequest(
      postRequest('/api/admin/ai-operations/reconciliation', {
        reason: 'Check for another stuck operation',
        idempotencyKey: 'operation-recovery-2',
      }),
      deps(store, adminAuth, () => 'reconciliation-audit-2'),
    );

    expect(first).toMatchObject({
      status: 200,
      body: {
        mode: 'applied',
        repeated: false,
        recoveredOperationIds: ['operation-recoverable'],
        expiredOperationIds: ['operation-expirable'],
      },
    });
    expect(retry).toMatchObject({ status: 200, body: { mode: 'applied', repeated: true } });
    expect(tooSoon).toMatchObject({
      status: 429,
      body: { code: 'admin_operation_reconciliation_rate_limited' },
    });
    await expect(store.repositories().operations.findById('operation-recoverable')).resolves.toMatchObject({
      status: 'succeeded',
    });
    await expect(store.repositories().operations.findById('operation-expirable')).resolves.toMatchObject({
      status: 'expired',
      error_code: 'operation_expired',
    });
    await expect(store.repositories().usage.findMonthlyUsage('creator-1', '2026-07')).resolves.toMatchObject({
      committed_generation_count: 1,
      reserved_generation_count: 0,
      generation_count: 1,
    });
  });

  it('assigns a tier with optimistic concurrency, idempotency, and an audit record', async () => {
    const store = await seededStore();
    const body = {
      tier: 'creator',
      expectedTier: 'free',
      expectedVersion: 0,
      reason: 'Closed alpha access',
      idempotencyKey: 'tier-change-1',
    };
    const first = await handleAdminRequest(
      postRequest('/api/admin/accounts/free-1/tier', body),
      deps(store, adminAuth, () => 'assignment-1'),
    );
    const retry = await handleAdminRequest(
      postRequest('/api/admin/accounts/free-1/tier', body),
      deps(store, adminAuth, () => 'assignment-retry'),
    );

    expect(first).toMatchObject({
      status: 200,
      body: {
        created: true,
        account: { id: 'free-1', tier: 'creator', tierVersion: 1 },
        audit: [{ action: 'tier.assign', reason: 'Closed alpha access' }],
      },
    });
    expect(retry).toMatchObject({ status: 200, body: { created: false } });
    expect((retry?.body as { audit: unknown[] }).audit).toHaveLength(1);
  });

  it('returns a stable conflict when a tier changed after the Admin loaded it', async () => {
    const store = await seededStore();
    const response = await handleAdminRequest(
      postRequest('/api/admin/accounts/creator-1/tier', {
        tier: 'free',
        expectedTier: 'creator',
        expectedVersion: 4,
        reason: 'End access',
        idempotencyKey: 'tier-change-stale',
      }),
      deps(store, adminAuth, () => 'assignment-stale'),
    );

    expect(response).toMatchObject({ status: 409, body: { code: 'admin_state_conflict' } });
  });

  it('creates and reverses a Quota Grant without mutating the original record', async () => {
    const store = await seededStore();
    const grant = await handleAdminRequest(
      postRequest('/api/admin/accounts/creator-1/quota-grants', {
        period: '2026-07',
        amount: 8,
        reason: 'Launch allowance',
        idempotencyKey: 'grant-1',
      }),
      deps(store, adminAuth, () => 'grant-1'),
    );
    const reversal = await handleAdminRequest(
      postRequest('/api/admin/quota-grants/grant-1/reversals', {
        amount: 3,
        reason: 'Correct allowance',
        idempotencyKey: 'reversal-1',
      }),
      deps(store, adminAuth, () => 'reversal-1'),
    );

    expect(grant).toMatchObject({ status: 200, body: { created: true, quotaGrants: [{ amount: 8 }] } });
    expect(reversal).toMatchObject({
      status: 200,
      body: {
        created: true,
        quotaGrants: [{ amount: 8, reversedAmount: 3 }],
        quotaGrantReversals: [{ amount: 3 }],
      },
    });
  });
});
