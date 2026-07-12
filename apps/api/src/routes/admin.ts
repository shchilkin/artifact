import { randomUUID } from 'node:crypto';
import { ACCOUNT_TIERS, type AccountTier, type AiUsageEventStatus } from '@artifact/shared';
import type { RequestLike, RequestUserResolution } from '../auth.js';
import {
  AccountTierVersionConflictError,
  IdempotencyInputConflictError,
  QuotaGrantReversalExceededError,
} from '../db/errors.js';
import type { ApiRepositories } from '../db/repositories.js';
import type {
  AdminAccountDetailRow,
  AdminAccountRow,
  AdminAuditEventRow,
  AiUsageEventRow,
  ProviderReconciliationRow,
  QuotaGrantReversalRow,
  QuotaGrantRow,
  TierAssignmentRow,
} from '../db/types.js';
import { errorJson, type JsonResponse, json, readJsonBody } from '../http.js';
import { getMonthlyQuotaPeriod } from '../quota.js';
import type { SafetyBudgetService } from '../safetyBudgetService.js';

const MAX_PAGE_SIZE = 100;

export interface AdminRouteRequest extends RequestLike {
  method?: string;
  url?: string;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer>;
}

export interface AdminRouteDeps {
  repositories: ApiRepositories;
  safetyBudget: SafetyBudgetService;
  resolveAuth(request: RequestLike): Promise<RequestUserResolution>;
  createId?: () => string;
  runInTransaction?<T>(operation: (repositories: ApiRepositories) => Promise<T>): Promise<T>;
}

type AdminResponse = JsonResponse<unknown>;

export async function handleAdminRequest(
  request: AdminRouteRequest,
  deps: AdminRouteDeps,
): Promise<AdminResponse | null> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://artifact.local');
  if (!url.pathname.startsWith('/api/admin/')) return null;

  const auth = await requireAdmin(request, deps);
  if (!auth.ok) return auth.response;
  try {
    return method === 'GET'
      ? await dispatchAdminRead(url, deps)
      : await dispatchAdminMutation(request, url.pathname, auth.user.id, deps);
  } catch (error) {
    if (error instanceof AdminRequestValidationError) {
      return errorJson(400, 'invalid_request', error.message);
    }
    throw error;
  }
}

async function dispatchAdminRead(url: URL, deps: AdminRouteDeps) {
  if (url.pathname === '/api/admin/overview') return overviewResponse(url, deps);
  if (url.pathname === '/api/admin/accounts') return accountsResponse(url, deps);
  if (url.pathname === '/api/admin/usage') return usageResponse(url, deps);
  if (url.pathname === '/api/admin/reconciliations') return reconciliationsResponse(url, deps);

  const accountId = accountIdFromPath(url.pathname);
  return accountId ? accountResponse(accountId, url, deps) : null;
}

async function dispatchAdminMutation(
  request: AdminRouteRequest,
  pathname: string,
  adminUserId: string,
  deps: AdminRouteDeps,
) {
  const tierAccountId = accountMutationIdFromPath(pathname, 'tier');
  if (tierAccountId) return assignTierResponse(request, tierAccountId, adminUserId, deps);
  const grantAccountId = accountMutationIdFromPath(pathname, 'quota-grants');
  if (grantAccountId) return createQuotaGrantResponse(request, grantAccountId, adminUserId, deps);
  const reversalGrantId = quotaReversalGrantIdFromPath(pathname);
  if (reversalGrantId) return createQuotaReversalResponse(request, reversalGrantId, adminUserId, deps);
  return null;
}

async function requireAdmin(request: AdminRouteRequest, deps: AdminRouteDeps) {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    return { ok: false as const, response: errorJson(401, 'admin_auth_required', 'Sign in as an Admin.') };
  }
  const user = await deps.repositories.users.upsertFromAuth({ id: auth.user.id, email: auth.user.email });
  if (user.disabled_at || user.role !== 'admin') {
    return { ok: false as const, response: errorJson(403, 'admin_access_denied', 'Admin access is required.') };
  }
  return { ok: true as const, user };
}

async function overviewResponse(url: URL, deps: AdminRouteDeps) {
  const period = readPeriod(url);
  const [overview, safetyBudget] = await Promise.all([
    deps.repositories.adminRead.getOverview(period),
    deps.safetyBudget.getSnapshot(),
  ]);
  return json(200, {
    period,
    accounts: {
      free: overview.free_count,
      creator: overview.creator_count,
      founder: overview.founder_count,
      total: overview.free_count + overview.creator_count + overview.founder_count,
    },
    generations: {
      committed: overview.committed_generation_count,
      reserved: overview.reserved_generation_count,
    },
    providerUsage: {
      costMicroUsd: overview.provider_cost_micro_usd,
      inputTokens: overview.input_tokens,
      outputTokens: overview.output_tokens,
      failedCalls: overview.failed_call_count,
    },
    safetyBudget,
  });
}

async function accountsResponse(url: URL, deps: AdminRouteDeps) {
  const pagination = readPagination(url);
  const result = await deps.repositories.adminRead.listAccounts({
    period: readPeriod(url),
    search: url.searchParams.get('q') ?? undefined,
    ...pagination,
  });
  return json(200, {
    accounts: result.rows.map(accountSummary),
    page: pageResponse(result.total, pagination),
  });
}

async function accountResponse(userId: string, url: URL, deps: AdminRouteDeps) {
  const detail = await deps.repositories.adminRead.getAccount(userId, readPeriod(url));
  if (!detail) return errorJson(404, 'admin_account_not_found', 'Account not found.');
  return json(200, accountDetail(detail));
}

async function usageResponse(url: URL, deps: AdminRouteDeps) {
  const pagination = readPagination(url);
  const status = readUsageStatus(url.searchParams.get('status'));
  if (status === 'invalid') return errorJson(400, 'invalid_request', 'Usage status must be succeeded or failed.');
  const result = await deps.repositories.adminRead.listUsage({
    userId: optionalParam(url, 'userId'),
    provider: optionalParam(url, 'provider'),
    ...(status ? { status } : {}),
    ...pagination,
  });
  return json(200, {
    usage: result.rows.map(usageEventResponse),
    page: pageResponse(result.total, pagination),
  });
}

async function reconciliationsResponse(url: URL, deps: AdminRouteDeps) {
  const limit = boundedInteger(url.searchParams.get('limit'), 30, 1, MAX_PAGE_SIZE);
  const rows = await deps.repositories.adminRead.listReconciliations(limit);
  return json(200, { reconciliations: rows.map(reconciliationResponse) });
}

async function assignTierResponse(
  request: AdminRouteRequest,
  userId: string,
  adminUserId: string,
  deps: AdminRouteDeps,
) {
  const body = await readAdminBody(request);
  if (!body.ok) return body.response;
  const tier = readTier(body.value.tier);
  const expectedTier = readTier(body.value.expectedTier);
  const expectedVersion = readNonNegativeInteger(body.value.expectedVersion);
  const mutation = readMutationMetadata(body.value);
  if (!tier || !expectedTier || expectedVersion === null || !mutation) {
    return errorJson(400, 'invalid_request', 'Tier, expected tier/version, reason, and idempotency key are required.');
  }
  try {
    return await runMutation(deps, async (repositories) => {
      const before = await repositories.adminRead.getAccount(userId, getMonthlyQuotaPeriod());
      if (!before) return errorJson(404, 'admin_account_not_found', 'Account not found.');
      if (tier === 'creator' && creatorAllowanceExhausted(before)) {
        return errorJson(409, 'admin_allowance_conflict', 'Current usage does not fit the Creator allowance.');
      }
      const id = deps.createId?.() ?? randomUUID();
      const result = await repositories.accountTiers.assignTier({
        id,
        userId,
        expectedTier,
        expectedVersion,
        newTier: tier,
        reason: mutation.reason,
        adminUserId,
        idempotencyKey: mutation.idempotencyKey,
      });
      if (result.assigned) {
        await repositories.adminAudit.append({
          id: `${id}:audit`,
          adminUserId,
          targetUserId: userId,
          action: 'tier.assign',
          entityType: 'tier_assignment',
          entityId: result.row.id,
          reason: mutation.reason,
          beforeJson: { tier: result.row.previous_tier, version: expectedVersion },
          afterJson: { tier: result.row.new_tier, version: expectedVersion + 1 },
        });
      }
      return mutationResponse(userId, result.assigned, repositories);
    });
  } catch (error) {
    return adminMutationError(error);
  }
}

async function createQuotaGrantResponse(
  request: AdminRouteRequest,
  userId: string,
  adminUserId: string,
  deps: AdminRouteDeps,
) {
  const body = await readAmountMutationBody(request);
  if (!body.ok) return body.response;
  const period = typeof body.value.period === 'string' ? body.value.period : getMonthlyQuotaPeriod();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return errorJson(400, 'invalid_request', 'Positive amount, UTC period, reason, and idempotency key are required.');
  }
  try {
    return await runMutation(deps, async (repositories) => {
      if (!(await repositories.users.findById(userId))) {
        return errorJson(404, 'admin_account_not_found', 'Account not found.');
      }
      const id = deps.createId?.() ?? randomUUID();
      const result = await repositories.accountTiers.createQuotaGrant({
        id,
        userId,
        period,
        amount: body.amount,
        reason: body.mutation.reason,
        adminUserId,
        idempotencyKey: body.mutation.idempotencyKey,
      });
      if (result.created) {
        await repositories.adminAudit.append({
          id: `${id}:audit`,
          adminUserId,
          targetUserId: userId,
          action: 'quota.grant',
          entityType: 'quota_grant',
          entityId: result.row.id,
          reason: body.mutation.reason,
          beforeJson: null,
          afterJson: { period, amount: body.amount },
        });
      }
      return mutationResponse(userId, result.created, repositories);
    });
  } catch (error) {
    return adminMutationError(error);
  }
}

async function createQuotaReversalResponse(
  request: AdminRouteRequest,
  grantId: string,
  adminUserId: string,
  deps: AdminRouteDeps,
) {
  const body = await readAmountMutationBody(request);
  if (!body.ok) return body.response;
  try {
    return await runMutation(deps, async (repositories) => {
      const id = deps.createId?.() ?? randomUUID();
      const result = await repositories.accountTiers.createQuotaGrantReversal({
        id,
        grantId,
        amount: body.amount,
        reason: body.mutation.reason,
        adminUserId,
        idempotencyKey: body.mutation.idempotencyKey,
      });
      const grant = await repositories.accountTiers.findQuotaGrant(result.row.grant_id);
      if (!grant) return errorJson(404, 'admin_quota_grant_not_found', 'Quota Grant not found.');
      const account = await repositories.adminRead.getAccount(grant.user_id, getMonthlyQuotaPeriod());
      if (!account) return errorJson(404, 'admin_account_not_found', 'Account not found.');
      if (result.created) {
        await repositories.adminAudit.append({
          id: `${id}:audit`,
          adminUserId,
          targetUserId: account.account.id,
          action: 'quota.reverse',
          entityType: 'quota_grant_reversal',
          entityId: result.row.id,
          reason: body.mutation.reason,
          beforeJson: { grantId },
          afterJson: { reversedAmount: body.amount },
        });
      }
      return json(200, { created: result.created, ...accountDetail(account) });
    });
  } catch (error) {
    return adminMutationError(error);
  }
}

async function mutationResponse(userId: string, created: boolean, repositories: ApiRepositories) {
  const detail = await repositories.adminRead.getAccount(userId, getMonthlyQuotaPeriod());
  if (!detail) return errorJson(404, 'admin_account_not_found', 'Account not found.');
  return json(200, { created, ...accountDetail(detail) });
}

function creatorAllowanceExhausted(detail: AdminAccountDetailRow) {
  const netGrant = detail.grants.reduce((total, grant) => total + grant.amount - grant.reversed_amount, 0);
  const used = detail.account.committed_generation_count + detail.account.reserved_generation_count;
  return used >= 20 + netGrant;
}

async function runMutation<T>(deps: AdminRouteDeps, operation: (repositories: ApiRepositories) => Promise<T>) {
  return deps.runInTransaction ? deps.runInTransaction(operation) : operation(deps.repositories);
}

function adminMutationError(error: unknown) {
  if (error instanceof AccountTierVersionConflictError) {
    return errorJson(409, 'admin_state_conflict', 'Account tier changed since it was loaded.');
  }
  if (error instanceof IdempotencyInputConflictError) {
    return errorJson(409, 'admin_idempotency_conflict', 'Idempotency key was already used for another change.');
  }
  if (error instanceof QuotaGrantReversalExceededError) {
    return errorJson(409, 'admin_reversal_exceeded', 'Reversal exceeds the remaining Quota Grant amount.');
  }
  if (error instanceof Error && error.message.startsWith('Quota grant not found:')) {
    return errorJson(404, 'admin_quota_grant_not_found', 'Quota Grant not found.');
  }
  throw error;
}

async function readAdminBody(request: AdminRouteRequest) {
  if (!request[Symbol.asyncIterator]) {
    return { ok: false as const, response: errorJson(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
  try {
    return { ok: true as const, value: await readJsonBody<Record<string, unknown>>(request as AsyncIterable<Buffer>) };
  } catch {
    return { ok: false as const, response: errorJson(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
}

async function readAmountMutationBody(request: AdminRouteRequest) {
  const body = await readAdminBody(request);
  if (!body.ok) return body;
  const mutation = readMutationMetadata(body.value);
  const amount = readPositiveInteger(body.value.amount);
  return mutation && amount !== null
    ? { ok: true as const, value: body.value, mutation, amount }
    : {
        ok: false as const,
        response: errorJson(400, 'invalid_request', 'Positive amount, reason, and idempotency key are required.'),
      };
}

function readMutationMetadata(body: Record<string, unknown>) {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  return reason && idempotencyKey ? { reason, idempotencyKey } : null;
}

function readTier(value: unknown): AccountTier | null {
  return typeof value === 'string' && ACCOUNT_TIERS.includes(value as AccountTier) ? (value as AccountTier) : null;
}

function readPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function accountSummary(row: AdminAccountRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    tier: row.tier,
    tierVersion: row.tier_version,
    generations: {
      committed: row.committed_generation_count,
      reserved: row.reserved_generation_count,
    },
    providerCostMicroUsd: row.provider_cost_micro_usd,
    failedCalls: row.failed_call_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function accountDetail(detail: AdminAccountDetailRow) {
  return {
    account: accountSummary(detail.account),
    tierAssignments: detail.assignments.map(tierAssignmentResponse),
    quotaGrants: detail.grants.map(quotaGrantResponse),
    quotaGrantReversals: detail.reversals.map(quotaReversalResponse),
    audit: detail.audits.map(auditResponse),
  };
}

function tierAssignmentResponse(row: TierAssignmentRow) {
  return {
    id: row.id,
    previousTier: row.previous_tier,
    newTier: row.new_tier,
    reason: row.reason,
    adminUserId: row.admin_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function quotaGrantResponse(row: QuotaGrantRow) {
  return {
    id: row.id,
    period: row.period,
    amount: row.amount,
    reversedAmount: row.reversed_amount,
    reason: row.reason,
    adminUserId: row.admin_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function quotaReversalResponse(row: QuotaGrantReversalRow) {
  return {
    id: row.id,
    grantId: row.grant_id,
    amount: row.amount,
    reason: row.reason,
    adminUserId: row.admin_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

function auditResponse(row: AdminAuditEventRow) {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    targetUserId: row.target_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.reason,
    before: row.before_json,
    after: row.after_json,
    createdAt: row.created_at.toISOString(),
  };
}

function usageEventResponse(row: AiUsageEventRow) {
  return {
    id: row.id,
    operationId: row.operation_id,
    userId: row.user_id,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    status: row.status,
    providerRequestId: row.provider_request_id,
    usage: row.usage_json,
    costMicroUsd: row.cost_micro_usd,
    pricingVersion: row.pricing_version,
    createdAt: row.created_at.toISOString(),
  };
}

function reconciliationResponse(row: ProviderReconciliationRow) {
  return {
    id: row.id,
    provider: row.provider,
    usageDate: row.usage_date,
    status: row.status,
    providerCostMicroUsd: row.provider_cost_micro_usd,
    internalCostMicroUsd: row.internal_cost_micro_usd,
    errorCode: row.error_code,
    syncedAt: row.synced_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function readPeriod(url: URL) {
  const period = url.searchParams.get('period') ?? getMonthlyQuotaPeriod();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AdminRequestValidationError('Period must use YYYY-MM.');
  return period;
}

function readPagination(url: URL) {
  return {
    limit: boundedInteger(url.searchParams.get('limit'), 25, 1, MAX_PAGE_SIZE),
    offset: boundedInteger(url.searchParams.get('offset'), 0, 0, 1_000_000),
  };
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function pageResponse(total: number, pagination: { limit: number; offset: number }) {
  return { ...pagination, total, hasMore: pagination.offset + pagination.limit < total };
}

function optionalParam(url: URL, name: string) {
  return url.searchParams.get(name)?.trim() || undefined;
}

function readUsageStatus(value: string | null): AiUsageEventStatus | 'invalid' | undefined {
  if (!value) return undefined;
  return value === 'succeeded' || value === 'failed' ? value : 'invalid';
}

function accountIdFromPath(pathname: string) {
  const match = /^\/api\/admin\/accounts\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function accountMutationIdFromPath(pathname: string, action: 'tier' | 'quota-grants') {
  const match = new RegExp(`^/api/admin/accounts/([^/]+)/${action}$`).exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function quotaReversalGrantIdFromPath(pathname: string) {
  const match = /^\/api\/admin\/quota-grants\/([^/]+)\/reversals$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

class AdminRequestValidationError extends Error {}
