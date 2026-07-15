import { normalizeMicroUsd, normalizeProviderUsageMetrics, requiredText } from './accountingValues.js';
import {
  AccountTierVersionConflictError,
  ActiveAiOperationExistsError,
  CloudProjectOwnershipConflictError,
  QuotaGrantReversalExceededError,
} from './errors.js';
import {
  assertOperationRetry,
  assertQuotaGrantRetry,
  assertQuotaGrantReversalRetry,
  assertTierAssignmentRetry,
} from './idempotencyInputs.js';
import type { ApiRepositories } from './repositories.js';
import type {
  AccountAccessRow,
  AdminAccountDetailRow,
  AdminAccountRow,
  AdminAuditEventRow,
  AdminOverviewRow,
  AdminUsageQuery,
  AiGenerationJobRow,
  AiOperationReconciliationResult,
  AiOperationRow,
  AiShaderRequestRow,
  AiUsageEventRow,
  AiUsageMonthlyRow,
  AssetRow,
  ClaimAiShaderRequestInput,
  CloudProjectRow,
  CompleteAiShaderRequestInput,
  CreateAdminAuditEventInput,
  CreateAiGenerationJobInput,
  CreateAiOperationInput,
  CreateAiUsageEventInput,
  CreateAssetInput,
  CreateProviderReconciliationInput,
  CreateQuotaGrantInput,
  CreateQuotaGrantReversalInput,
  CreateTierAssignmentInput,
  CreateUserInput,
  JsonObject,
  ProviderReconciliationRow,
  QuotaGrantReversalRow,
  QuotaGrantRow,
  ReconcileAiOperationsInput,
  ReleaseAiOperationInput,
  ReserveAiOperationInput,
  TierAssignmentRow,
  UpsertAuthenticatedUserInput,
  UpsertCloudProjectInput,
  UserRow,
} from './types.js';

export class InMemoryApiStore {
  private readonly users = new Map<string, UserRow>();
  private readonly accountAccess = new Map<string, AccountAccessRow>();
  private readonly operations = new Map<string, AiOperationRow>();
  private readonly usageEvents = new Map<string, AiUsageEventRow>();
  private readonly adminAuditEvents = new Map<string, AdminAuditEventRow>();
  private readonly reconciliations = new Map<string, ProviderReconciliationRow>();
  private readonly tierAssignments = new Map<string, TierAssignmentRow>();
  private readonly quotaGrants = new Map<string, QuotaGrantRow>();
  private readonly quotaGrantReversals = new Map<string, QuotaGrantReversalRow>();
  private readonly jobs = new Map<string, AiGenerationJobRow>();
  private readonly shaderRequests = new Map<string, AiShaderRequestRow>();
  private readonly assets = new Map<string, AssetRow>();
  private readonly projects = new Map<string, CloudProjectRow>();
  private readonly monthlyUsage = new Map<string, AiUsageMonthlyRow>();

  seedUser(input: CreateUserInput): UserRow {
    const existing = this.users.get(input.id);
    if (existing) return existing;
    const now = new Date();
    const row: UserRow = {
      id: input.id,
      email: input.email ?? null,
      role: input.role ?? 'user',
      ai_enabled: input.aiEnabled ?? false,
      plus_status: input.plusStatus ?? 'none',
      created_at: now,
      updated_at: now,
      disabled_at: null,
    };
    this.users.set(row.id, row);
    return row;
  }

  seedAccountAccess(userId: string, tier: AccountAccessRow['tier']): AccountAccessRow {
    if (!this.users.has(userId)) throw new Error(`User not found: ${userId}`);
    const now = new Date();
    const row: AccountAccessRow = {
      user_id: userId,
      tier,
      version: 0,
      created_at: now,
      updated_at: now,
    };
    this.accountAccess.set(userId, row);
    return row;
  }

  async findById(id: string): Promise<UserRow | null> {
    return this.users.get(id) ?? null;
  }

  async setUserRole(id: string, role: UserRow['role']): Promise<UserRow> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User not found: ${id}`);
    const updated = { ...user, role, updated_at: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async findAccountAccess(userId: string): Promise<AccountAccessRow | null> {
    return this.accountAccess.get(userId) ?? null;
  }

  async ensureAccountAccess(userId: string): Promise<AccountAccessRow> {
    const existing = this.accountAccess.get(userId);
    if (existing) return existing;
    if (!this.users.has(userId)) throw new Error(`User not found: ${userId}`);
    const now = new Date();
    const row: AccountAccessRow = {
      user_id: userId,
      tier: 'free',
      version: 0,
      created_at: now,
      updated_at: now,
    };
    this.accountAccess.set(userId, row);
    return row;
  }

  async listLegacyAiEnabledUsers() {
    return Array.from(this.users.values())
      .filter((user) => user.ai_enabled)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((user) => ({ userId: user.id, email: user.email }));
  }

  async findOperationByIdempotencyKey(
    userId: string,
    feature: CreateAiOperationInput['feature'],
    idempotencyKey: string,
  ): Promise<AiOperationRow | null> {
    return (
      Array.from(this.operations.values()).find(
        (operation) =>
          operation.user_id === userId && operation.feature === feature && operation.idempotency_key === idempotencyKey,
      ) ?? null
    );
  }

  async findOperationById(id: string): Promise<AiOperationRow | null> {
    return this.operations.get(id) ?? null;
  }

  async countActiveOperationsForUser(userId: string): Promise<number> {
    return Array.from(this.operations.values()).filter(
      (operation) =>
        operation.user_id === userId && (operation.status === 'reserved' || operation.status === 'running'),
    ).length;
  }

  async reserveOperation(input: ReserveAiOperationInput): Promise<{ row: AiOperationRow; claimed: boolean } | null> {
    const existing = await this.findOperationByIdempotencyKey(input.userId, input.feature, input.idempotencyKey);
    if (existing) {
      assertOperationRetry(existing, input);
      return { row: existing, claimed: false };
    }
    const activeCount = Array.from(this.operations.values()).filter(
      (operation) =>
        operation.user_id === input.userId && (operation.status === 'reserved' || operation.status === 'running'),
    ).length;
    if (activeCount >= input.maxActiveOperations) throw new ActiveAiOperationExistsError(input.userId);
    const usageKey = monthlyUsageKey(input.userId, input.reservationPeriod);
    const usage =
      this.monthlyUsage.get(usageKey) ??
      emptyMonthlyUsage(input.userId, input.reservationPeriod, input.generationLimit);
    if (usage.committed_generation_count + usage.reserved_generation_count >= input.generationLimit) return null;
    const now = new Date();
    const row: AiOperationRow = {
      id: input.id,
      user_id: input.userId,
      feature: input.feature,
      status: 'reserved',
      idempotency_key: input.idempotencyKey,
      reservation_period: input.reservationPeriod,
      reserved_generations: input.reservedGenerations,
      error_code: null,
      created_at: now,
      started_at: null,
      completed_at: null,
    };
    this.monthlyUsage.set(usageKey, {
      ...usage,
      generation_limit: input.generationLimit,
      generation_count: usage.committed_generation_count + usage.reserved_generation_count + input.reservedGenerations,
      reserved_generation_count: usage.reserved_generation_count + input.reservedGenerations,
      updated_at: now,
    });
    this.operations.set(row.id, row);
    return { row, claimed: true };
  }

  async markOperationRunning(id: string, startedAt: Date): Promise<AiOperationRow> {
    const operation = this.requireOperation(id);
    if (operation.status === 'running') return operation;
    if (operation.status !== 'reserved' && operation.status !== 'awaiting_validation') {
      throw new Error(`AI operation cannot start from ${operation.status}: ${id}`);
    }
    const running = { ...operation, status: 'running' as const, started_at: startedAt };
    this.operations.set(id, running);
    return running;
  }

  async markOperationAwaitingValidation(id: string): Promise<AiOperationRow> {
    const operation = this.requireOperation(id);
    if (operation.status === 'awaiting_validation') return operation;
    if (operation.status !== 'running') {
      throw new Error(`AI operation cannot await validation from ${operation.status}: ${id}`);
    }
    const awaitingValidation = { ...operation, status: 'awaiting_validation' as const };
    this.operations.set(id, awaitingValidation);
    return awaitingValidation;
  }

  async markOperationSucceeded(id: string, completedAt: Date): Promise<AiOperationRow> {
    const operation = this.requireOperation(id);
    if (operation.status === 'succeeded') return operation;
    if (!['reserved', 'running', 'awaiting_validation'].includes(operation.status)) {
      throw new Error(`AI operation cannot succeed from ${operation.status}: ${id}`);
    }
    this.commitOperationUsage(operation, completedAt);
    const succeeded = { ...operation, status: 'succeeded' as const, completed_at: completedAt };
    this.operations.set(id, succeeded);
    return succeeded;
  }

  async releaseOperation(input: ReleaseAiOperationInput): Promise<AiOperationRow> {
    const operation = this.requireOperation(input.id);
    if (operation.status === input.status) return operation;
    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(operation.status)) return operation;
    if (!['reserved', 'running', 'awaiting_validation'].includes(operation.status)) {
      throw new Error(`AI operation cannot release from ${operation.status}: ${input.id}`);
    }
    this.releaseOperationUsage(operation, input.completedAt);
    const released = {
      ...operation,
      status: input.status,
      error_code: input.errorCode ?? null,
      completed_at: input.completedAt,
    };
    this.operations.set(input.id, released);
    return released;
  }

  async reconcileOperations(input: ReconcileAiOperationsInput): Promise<AiOperationReconciliationResult> {
    const active = Array.from(this.operations.values()).filter((operation) =>
      ['reserved', 'running', 'awaiting_validation'].includes(operation.status),
    );
    const recoverable = active
      .filter((operation) => this.operationHasUsableResult(operation.id))
      .sort((left, right) => left.created_at.getTime() - right.created_at.getTime())
      .slice(0, input.limit);
    const expirable = active
      .filter((operation) => !this.operationHasUsableResult(operation.id))
      .filter((operation) => (operation.started_at ?? operation.created_at) < input.staleBefore)
      .sort(
        (left, right) =>
          (left.started_at ?? left.created_at).getTime() - (right.started_at ?? right.created_at).getTime(),
      )
      .slice(0, input.limit);

    if (input.dryRun) {
      return {
        recoveredOperationIds: recoverable.map((operation) => operation.id),
        expiredOperationIds: expirable.map((operation) => operation.id),
      };
    }

    const recoveredOperationIds: string[] = [];
    for (const operation of recoverable) {
      await this.markOperationSucceeded(operation.id, input.now);
      recoveredOperationIds.push(operation.id);
    }
    const expiredOperationIds: string[] = [];
    for (const operation of expirable) {
      await this.releaseOperation({
        id: operation.id,
        status: 'expired',
        errorCode: 'operation_expired',
        completedAt: input.now,
      });
      this.expireOperationChildren(operation.id, input.now);
      expiredOperationIds.push(operation.id);
    }
    return { recoveredOperationIds, expiredOperationIds };
  }

  private operationHasUsableResult(operationId: string) {
    return (
      Array.from(this.jobs.values()).some(
        (job) => job.operation_id === operationId && job.status === 'succeeded' && job.output_asset_id !== null,
      ) ||
      Array.from(this.shaderRequests.values()).some(
        (request) =>
          request.operation_id === operationId && request.status === 'accepted' && request.response_json !== null,
      )
    );
  }

  private expireOperationChildren(operationId: string, completedAt: Date) {
    for (const [id, job] of this.jobs) {
      if (job.operation_id !== operationId || (job.status !== 'queued' && job.status !== 'running')) continue;
      this.jobs.set(id, {
        ...job,
        status: 'expired',
        error_code: job.error_code ?? 'operation_expired',
        error_message: job.error_message ?? 'Generation operation expired during cleanup.',
        retryable: false,
        completed_at: completedAt,
      });
    }
    for (const [id, request] of this.shaderRequests) {
      if (
        request.operation_id !== operationId ||
        !['pending', 'generated', 'client_rejected', 'repairing'].includes(request.status)
      )
        continue;
      this.shaderRequests.set(id, {
        ...request,
        status: 'failed',
        error_status: 504,
        error_code: request.error_code ?? 'operation_expired',
        error_message: request.error_message ?? 'Shader operation expired before completion.',
        completed_at: completedAt,
      });
    }
  }

  private requireOperation(id: string): AiOperationRow {
    const operation = this.operations.get(id);
    if (!operation) throw new Error(`AI operation not found: ${id}`);
    return operation;
  }

  private commitOperationUsage(operation: AiOperationRow, updatedAt: Date) {
    const key = monthlyUsageKey(operation.user_id, operation.reservation_period);
    const usage = this.monthlyUsage.get(key);
    if (!usage) throw new Error(`Monthly usage not found: ${operation.user_id}:${operation.reservation_period}`);
    const reserved = Math.max(0, usage.reserved_generation_count - operation.reserved_generations);
    const committed = usage.committed_generation_count + operation.reserved_generations;
    this.monthlyUsage.set(key, {
      ...usage,
      generation_count: committed + reserved,
      committed_generation_count: committed,
      reserved_generation_count: reserved,
      updated_at: updatedAt,
    });
  }

  private releaseOperationUsage(operation: AiOperationRow, updatedAt: Date) {
    const key = monthlyUsageKey(operation.user_id, operation.reservation_period);
    const usage = this.monthlyUsage.get(key);
    if (!usage) throw new Error(`Monthly usage not found: ${operation.user_id}:${operation.reservation_period}`);
    const reserved = Math.max(0, usage.reserved_generation_count - operation.reserved_generations);
    this.monthlyUsage.set(key, {
      ...usage,
      generation_count: usage.committed_generation_count + reserved,
      reserved_generation_count: reserved,
      updated_at: updatedAt,
    });
  }

  async appendUsageEvent(input: CreateAiUsageEventInput): Promise<AiUsageEventRow> {
    const existing = this.usageEvents.get(input.id);
    if (existing) return existing;
    if (!this.users.has(input.userId)) throw new Error(`User not found: ${input.userId}`);
    const row = createUsageEventRow(input);
    this.usageEvents.set(row.id, row);
    this.updateMonthlyProviderUsage(row);
    return row;
  }

  private updateMonthlyProviderUsage(row: AiUsageEventRow) {
    const period = row.created_at.toISOString().slice(0, 7);
    const key = monthlyUsageKey(row.user_id, period);
    const current = this.monthlyUsage.get(key) ?? emptyMonthlyUsage(row.user_id, period, 0);
    const inputTokens = Number(row.usage_json.inputTokens ?? 0);
    const outputTokens = Number(row.usage_json.outputTokens ?? 0);
    this.monthlyUsage.set(key, {
      ...current,
      provider_cost_micro_usd: (BigInt(current.provider_cost_micro_usd) + BigInt(row.cost_micro_usd)).toString(),
      input_tokens: (BigInt(current.input_tokens) + BigInt(inputTokens)).toString(),
      output_tokens: (BigInt(current.output_tokens) + BigInt(outputTokens)).toString(),
      failed_call_count: current.failed_call_count + (row.status === 'failed' ? 1 : 0),
      updated_at: row.created_at,
    });
  }

  async sumUsageEventCost(input: { from: Date; to: Date; provider?: string }) {
    let total = 0n;
    for (const event of this.usageEvents.values()) {
      if (event.created_at < input.from || event.created_at >= input.to) continue;
      if (input.provider && event.provider !== input.provider) continue;
      total += BigInt(event.cost_micro_usd);
    }
    return { costMicroUsd: total.toString() };
  }

  async appendAdminAuditEvent(input: CreateAdminAuditEventInput): Promise<AdminAuditEventRow> {
    if (this.adminAuditEvents.has(input.id)) throw new Error(`Admin audit event already exists: ${input.id}`);
    if (!this.users.has(input.adminUserId)) throw new Error(`Admin user not found: ${input.adminUserId}`);
    const row: AdminAuditEventRow = {
      id: input.id,
      admin_user_id: input.adminUserId,
      target_user_id: input.targetUserId ?? null,
      action: requiredText(input.action, 'action'),
      entity_type: requiredText(input.entityType, 'entityType'),
      entity_id: requiredText(input.entityId, 'entityId'),
      reason: requiredText(input.reason, 'reason'),
      before_json: input.beforeJson ?? null,
      after_json: input.afterJson ?? null,
      created_at: input.createdAt ?? new Date(),
    };
    this.adminAuditEvents.set(row.id, row);
    return row;
  }

  async lockAdminAction(action: string): Promise<void> {
    requiredText(action, 'action');
  }

  async findAdminAuditByActionEntity(action: string, entityId: string): Promise<AdminAuditEventRow | null> {
    return (
      Array.from(this.adminAuditEvents.values())
        .filter((event) => event.action === action && event.entity_id === entityId)
        .sort(newestFirst)[0] ?? null
    );
  }

  async findLatestAdminAuditByAction(action: string): Promise<AdminAuditEventRow | null> {
    return (
      Array.from(this.adminAuditEvents.values())
        .filter((event) => event.action === action)
        .sort(newestFirst)[0] ?? null
    );
  }

  async upsertProviderReconciliation(input: CreateProviderReconciliationInput): Promise<ProviderReconciliationRow> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.usageDate)) throw new Error('usageDate must use YYYY-MM-DD');
    const key = `${input.provider}:${input.usageDate}`;
    const existing = this.reconciliations.get(key);
    const row: ProviderReconciliationRow = {
      id: existing?.id ?? input.id,
      provider: requiredText(input.provider, 'provider'),
      usage_date: input.usageDate,
      status: input.status,
      provider_cost_micro_usd:
        input.providerCostMicroUsd === null || input.providerCostMicroUsd === undefined
          ? null
          : normalizeMicroUsd(input.providerCostMicroUsd),
      internal_cost_micro_usd: normalizeMicroUsd(input.internalCostMicroUsd),
      error_code: input.errorCode ?? null,
      synced_at: input.syncedAt ?? null,
      created_at: existing?.created_at ?? new Date(),
    };
    this.reconciliations.set(key, row);
    return row;
  }

  async getAdminOverview(period: string): Promise<AdminOverviewRow> {
    monthlyPeriod(period);
    const overview: AdminOverviewRow = {
      free_count: 0,
      creator_count: 0,
      founder_count: 0,
      committed_generation_count: 0,
      reserved_generation_count: 0,
      provider_cost_micro_usd: '0',
      input_tokens: '0',
      output_tokens: '0',
      failed_call_count: 0,
    };
    for (const user of this.users.values()) {
      const tier = this.accountAccess.get(user.id)?.tier ?? 'free';
      overview[`${tier}_count`] += 1;
      const usage = this.monthlyUsage.get(monthlyUsageKey(user.id, period));
      if (!usage) continue;
      overview.committed_generation_count += usage.committed_generation_count;
      overview.reserved_generation_count += usage.reserved_generation_count;
      overview.provider_cost_micro_usd = addIntegerStrings(
        overview.provider_cost_micro_usd,
        usage.provider_cost_micro_usd,
      );
      overview.input_tokens = addIntegerStrings(overview.input_tokens, usage.input_tokens);
      overview.output_tokens = addIntegerStrings(overview.output_tokens, usage.output_tokens);
      overview.failed_call_count += usage.failed_call_count;
    }
    return overview;
  }

  async listAdminAccounts(input: { period: string; search?: string; limit: number; offset: number }) {
    monthlyPeriod(input.period);
    const search = input.search?.trim().toLowerCase();
    const accounts = Array.from(this.users.values())
      .filter((user) => !search || user.id.toLowerCase().includes(search) || user.email?.toLowerCase().includes(search))
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime() || left.id.localeCompare(right.id))
      .map((user) => this.adminAccountRow(user, input.period));
    return { rows: accounts.slice(input.offset, input.offset + input.limit), total: accounts.length };
  }

  async getAdminAccount(userId: string, period: string): Promise<AdminAccountDetailRow | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    return {
      account: this.adminAccountRow(user, period),
      assignments: Array.from(this.tierAssignments.values())
        .filter((row) => row.user_id === userId)
        .sort(newestFirst),
      grants: Array.from(this.quotaGrants.values())
        .filter((row) => row.user_id === userId)
        .sort(newestFirst),
      reversals: Array.from(this.quotaGrantReversals.values())
        .filter((row) => this.quotaGrants.get(row.grant_id)?.user_id === userId)
        .sort(newestFirst),
      audits: Array.from(this.adminAuditEvents.values())
        .filter((row) => row.target_user_id === userId)
        .sort(newestFirst),
    };
  }

  async listAdminUsage(input: AdminUsageQuery) {
    const rows = Array.from(this.usageEvents.values())
      .filter((row) => !input.userId || row.user_id === input.userId)
      .filter((row) => !input.provider || row.provider === input.provider)
      .filter((row) => !input.status || row.status === input.status)
      .sort(newestFirst);
    return { rows: rows.slice(input.offset, input.offset + input.limit), total: rows.length };
  }

  async listAdminReconciliations(limit: number) {
    return Array.from(this.reconciliations.values())
      .sort(
        (left, right) => right.usage_date.localeCompare(left.usage_date) || left.provider.localeCompare(right.provider),
      )
      .slice(0, limit);
  }

  private adminAccountRow(user: UserRow, period: string): AdminAccountRow {
    const access = this.accountAccess.get(user.id) ?? {
      tier: 'free' as const,
      version: 0,
      updated_at: user.updated_at,
    };
    const usage = this.monthlyUsage.get(monthlyUsageKey(user.id, period)) ?? emptyMonthlyUsage(user.id, period, 0);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tier: access.tier,
      tier_version: access.version,
      committed_generation_count: usage.committed_generation_count,
      reserved_generation_count: usage.reserved_generation_count,
      provider_cost_micro_usd: usage.provider_cost_micro_usd,
      failed_call_count: usage.failed_call_count,
      created_at: user.created_at,
      updated_at: access.updated_at > user.updated_at ? access.updated_at : user.updated_at,
    };
  }

  async assignTier(input: CreateTierAssignmentInput): Promise<{ row: TierAssignmentRow; assigned: boolean }> {
    const existing = Array.from(this.tierAssignments.values()).find(
      (assignment) =>
        assignment.admin_user_id === input.adminUserId && assignment.idempotency_key === input.idempotencyKey,
    );
    if (existing) {
      assertTierAssignmentRetry(existing, input);
      return { row: existing, assigned: false };
    }
    const access = await this.ensureAccountAccess(input.userId);
    if (access.tier !== input.expectedTier || access.version !== input.expectedVersion) {
      throw new AccountTierVersionConflictError(input.userId);
    }
    const reason = requiredText(input.reason, 'reason');
    const now = new Date();
    const row: TierAssignmentRow = {
      id: input.id,
      user_id: input.userId,
      previous_tier: access.tier,
      new_tier: input.newTier,
      reason,
      admin_user_id: input.adminUserId,
      idempotency_key: input.idempotencyKey,
      created_at: now,
    };
    this.accountAccess.set(input.userId, {
      ...access,
      tier: input.newTier,
      version: access.version + 1,
      updated_at: now,
    });
    this.tierAssignments.set(row.id, row);
    return { row, assigned: true };
  }

  async createQuotaGrant(input: CreateQuotaGrantInput): Promise<{ row: QuotaGrantRow; created: boolean }> {
    const existing = Array.from(this.quotaGrants.values()).find(
      (grant) => grant.admin_user_id === input.adminUserId && grant.idempotency_key === input.idempotencyKey,
    );
    if (existing) {
      assertQuotaGrantRetry(existing, input);
      return { row: existing, created: false };
    }
    if (!this.users.has(input.userId)) throw new Error(`User not found: ${input.userId}`);
    const row: QuotaGrantRow = {
      id: input.id,
      user_id: input.userId,
      period: monthlyPeriod(input.period),
      amount: positiveInteger(input.amount, 'amount'),
      reversed_amount: 0,
      reason: requiredText(input.reason, 'reason'),
      admin_user_id: input.adminUserId,
      idempotency_key: input.idempotencyKey,
      created_at: new Date(),
    };
    this.quotaGrants.set(row.id, row);
    return { row, created: true };
  }

  async findQuotaGrant(id: string): Promise<QuotaGrantRow | null> {
    return this.quotaGrants.get(id) ?? null;
  }

  async createQuotaGrantReversal(
    input: CreateQuotaGrantReversalInput,
  ): Promise<{ row: QuotaGrantReversalRow; created: boolean }> {
    const existing = Array.from(this.quotaGrantReversals.values()).find(
      (reversal) => reversal.admin_user_id === input.adminUserId && reversal.idempotency_key === input.idempotencyKey,
    );
    if (existing) {
      assertQuotaGrantReversalRetry(existing, input);
      return { row: existing, created: false };
    }
    const grant = this.quotaGrants.get(input.grantId);
    if (!grant) throw new Error(`Quota grant not found: ${input.grantId}`);
    const amount = positiveInteger(input.amount, 'amount');
    if (grant.reversed_amount + amount > grant.amount) throw new QuotaGrantReversalExceededError(grant.id);
    const row: QuotaGrantReversalRow = {
      id: input.id,
      grant_id: grant.id,
      amount,
      reason: requiredText(input.reason, 'reason'),
      admin_user_id: input.adminUserId,
      idempotency_key: input.idempotencyKey,
      created_at: new Date(),
    };
    this.quotaGrants.set(grant.id, { ...grant, reversed_amount: grant.reversed_amount + amount });
    this.quotaGrantReversals.set(row.id, row);
    return { row, created: true };
  }

  async sumQuotaAdjustments(userId: string, period: string): Promise<{ granted: number; reversed: number }> {
    const grants = Array.from(this.quotaGrants.values()).filter(
      (grant) => grant.user_id === userId && grant.period === period,
    );
    const grantIds = new Set(grants.map((grant) => grant.id));
    return {
      granted: grants.reduce((sum, grant) => sum + grant.amount, 0),
      reversed: Array.from(this.quotaGrantReversals.values())
        .filter((reversal) => grantIds.has(reversal.grant_id))
        .reduce((sum, reversal) => sum + reversal.amount, 0),
    };
  }

  async upsertUserFromAuth(input: UpsertAuthenticatedUserInput): Promise<UserRow> {
    const existing = this.users.get(input.id);
    const now = new Date();
    if (existing) {
      const updated: UserRow = {
        ...existing,
        email: input.email ?? existing.email,
        updated_at: now,
      };
      this.users.set(input.id, updated);
      return updated;
    }

    const row: UserRow = {
      id: input.id,
      email: input.email ?? null,
      role: 'user',
      ai_enabled: false,
      plus_status: 'none',
      created_at: now,
      updated_at: now,
      disabled_at: null,
    };
    this.users.set(row.id, row);
    return row;
  }

  async findGenerationJobByIdForUser(id: string, userId: string): Promise<AiGenerationJobRow | null> {
    const job = this.jobs.get(id);
    if (job && job.user_id === userId) return job;
    return null;
  }

  async findAssetByIdForUser(id: string, userId: string): Promise<AssetRow | null> {
    const asset = this.assets.get(id);
    if (asset && asset.user_id === userId) return asset;
    return null;
  }

  async findProjectAssetByFingerprintForUser(input: {
    userId: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<AssetRow | null> {
    return (
      Array.from(this.assets.values()).find(
        (asset) =>
          asset.user_id === input.userId &&
          asset.kind === input.kind &&
          asset.mime_type === input.mimeType &&
          asset.size_bytes === input.sizeBytes &&
          asset.metadata_json.sha256 === input.sha256 &&
          !asset.deleted_at,
      ) ?? null
    );
  }

  async listProjectAssetsForUser(userId: string): Promise<AssetRow[]> {
    return Array.from(this.assets.values()).filter(
      (asset) => asset.user_id === userId && asset.kind.startsWith('project-') && !asset.deleted_at,
    );
  }

  async softDeleteAsset(id: string, userId: string, deletedAt: Date): Promise<AssetRow> {
    const asset = this.assets.get(id);
    if (!asset || asset.user_id !== userId) throw new Error(`Asset not found: ${id}`);
    const updated = { ...asset, deleted_at: deletedAt };
    this.assets.set(id, updated);
    return updated;
  }

  async softDeleteAssetsForUser(ids: readonly string[], userId: string, deletedAt: Date): Promise<AssetRow[]> {
    const deleted: AssetRow[] = [];
    for (const id of ids) {
      const asset = this.assets.get(id);
      if (!asset || asset.user_id !== userId || !asset.kind.startsWith('project-') || asset.deleted_at) continue;
      const updated = { ...asset, deleted_at: deletedAt };
      this.assets.set(id, updated);
      deleted.push(updated);
    }
    return deleted;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiGenerationJobRow | null> {
    return (
      Array.from(this.jobs.values()).find((job) => job.user_id === userId && job.idempotency_key === idempotencyKey) ??
      null
    );
  }

  async claimShaderRequest(input: ClaimAiShaderRequestInput): Promise<{ row: AiShaderRequestRow; claimed: boolean }> {
    const existing = Array.from(this.shaderRequests.values()).find(
      (request) => request.user_id === input.userId && request.idempotency_key === input.idempotencyKey,
    );
    if (existing) return { row: existing, claimed: false };
    const row: AiShaderRequestRow = {
      id: input.id,
      operation_id: input.operationId ?? null,
      user_id: input.userId,
      idempotency_key: input.idempotencyKey,
      mode: input.mode,
      prompt: input.prompt,
      parent_request_id: input.parentRequestId ?? null,
      status: 'pending',
      response_json: null,
      provider_request_id: null,
      provider_usage_json: null,
      error_status: null,
      error_code: null,
      error_message: null,
      compiler_diagnostic_json: null,
      repair_count: 0,
      created_at: new Date(),
      completed_at: null,
    };
    this.shaderRequests.set(row.id, row);
    return { row, claimed: true };
  }

  async findShaderByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiShaderRequestRow | null> {
    return (
      Array.from(this.shaderRequests.values()).find(
        (request) => request.user_id === userId && request.idempotency_key === idempotencyKey,
      ) ?? null
    );
  }

  async attachShaderOperation(id: string, operationId: string): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(id);
    if (!request || (request.operation_id !== null && request.operation_id !== operationId)) {
      throw new Error(`Shader request operation could not be attached: ${id}`);
    }
    const attached = { ...request, operation_id: operationId };
    this.shaderRequests.set(id, attached);
    return attached;
  }

  async findShaderByIdForUser(id: string, userId: string): Promise<AiShaderRequestRow | null> {
    const request = this.shaderRequests.get(id);
    return request?.user_id === userId ? request : null;
  }

  async markShaderGenerated(input: CompleteAiShaderRequestInput): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(input.id);
    if (!request || request.status !== 'pending') {
      throw new Error(`Pending shader request not found: ${input.id}`);
    }
    const completed: AiShaderRequestRow = {
      ...request,
      status: 'generated',
      response_json: input.responseJson,
      provider_request_id: input.providerRequestId ?? null,
      provider_usage_json: input.providerUsageJson ?? null,
      completed_at: null,
    };
    this.shaderRequests.set(request.id, completed);
    return completed;
  }

  async acceptShaderRequest(id: string, candidateRevision: number, completedAt: Date): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(id);
    if (!request || request.status !== 'generated' || request.repair_count !== candidateRevision) {
      throw new Error(`Generated shader request not found: ${id}`);
    }
    const accepted = { ...request, status: 'accepted' as const, completed_at: completedAt };
    this.shaderRequests.set(id, accepted);
    return accepted;
  }

  async rejectShaderRequest(input: import('./types.js').RejectAiShaderRequestInput): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(input.id);
    if (!request || request.status !== 'generated' || request.repair_count !== input.candidateRevision) {
      throw new Error(`Generated shader request not found: ${input.id}`);
    }
    const rejected: AiShaderRequestRow = {
      ...request,
      status: input.terminal ? 'failed' : 'client_rejected',
      compiler_diagnostic_json: input.diagnosticJson,
      error_status: input.terminal ? 422 : null,
      error_code: input.terminal ? 'shader_browser_validation_failed' : null,
      error_message: input.terminal ? 'The repaired shader did not pass browser validation.' : null,
      completed_at: input.terminal ? input.completedAt : null,
    };
    this.shaderRequests.set(input.id, rejected);
    return rejected;
  }

  async beginShaderRepair(id: string): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(id);
    if (!request || request.status !== 'client_rejected' || request.repair_count !== 0) {
      throw new Error(`Repairable shader request not found: ${id}`);
    }
    const repairing = { ...request, status: 'repairing' as const, repair_count: 1 };
    this.shaderRequests.set(id, repairing);
    return repairing;
  }

  async completeShaderRepair(input: CompleteAiShaderRequestInput): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(input.id);
    if (!request || request.status !== 'repairing' || request.repair_count !== 1) {
      throw new Error(`Repairing shader request not found: ${input.id}`);
    }
    const generated: AiShaderRequestRow = {
      ...request,
      status: 'generated',
      response_json: input.responseJson,
      provider_request_id: input.providerRequestId ?? null,
      provider_usage_json: { ...(request.provider_usage_json ?? {}), ...(input.providerUsageJson ?? {}) },
      completed_at: null,
    };
    this.shaderRequests.set(input.id, generated);
    return generated;
  }

  async failShaderRequest(
    id: string,
    error: { status: number; code: string; message: string; completedAt: Date },
  ): Promise<AiShaderRequestRow> {
    const request = this.shaderRequests.get(id);
    if (!request || (request.status !== 'pending' && request.status !== 'repairing')) {
      throw new Error(`Pending shader request not found: ${id}`);
    }
    const failed: AiShaderRequestRow = {
      ...request,
      status: 'failed',
      error_status: error.status,
      error_code: error.code,
      error_message: error.message,
      completed_at: error.completedAt,
    };
    this.shaderRequests.set(id, failed);
    return failed;
  }

  async markRunning(id: string, startedAt: Date): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'running',
      attempt_count: job.attempt_count + 1,
      started_at: startedAt,
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async markSucceeded(id: string, outputAssetId: string, completedAt: Date): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'succeeded',
      output_asset_id: outputAssetId,
      completed_at: completedAt,
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async markCancelled(id: string, cancelledAt: Date): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'cancelled',
      cancelled_at: cancelledAt,
      completed_at: cancelledAt,
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async markFailed(
    id: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
      providerUsageJson?: JsonObject | null;
      estimatedCost?: string | null;
    },
  ): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'failed',
      error_code: error.code,
      error_message: error.message,
      retryable: error.retryable,
      provider_usage_json: error.providerUsageJson ?? null,
      estimated_cost: error.estimatedCost ?? null,
      completed_at: new Date(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async createAsset(input: CreateAssetInput): Promise<AssetRow> {
    const now = new Date();
    const row: AssetRow = {
      id: input.id,
      user_id: input.userId,
      kind: input.kind,
      storage_key: input.storageKey,
      public_uri: input.publicUri ?? null,
      mime_type: input.mimeType,
      width: input.width,
      height: input.height,
      size_bytes: input.sizeBytes,
      metadata_json: input.metadataJson,
      created_at: now,
      deleted_at: null,
    };
    this.assets.set(row.id, row);
    return row;
  }

  async findMonthlyUsage(userId: string, period: string): Promise<AiUsageMonthlyRow | null> {
    return this.monthlyUsage.get(monthlyUsageKey(userId, period)) ?? null;
  }

  async upsertMonthlyUsage(input: {
    userId: string;
    period: string;
    generationLimit: number;
    generationCountDelta?: number;
    estimatedCostDelta?: string;
  }): Promise<AiUsageMonthlyRow> {
    const key = monthlyUsageKey(input.userId, input.period);
    const existing = this.monthlyUsage.get(key);
    const row: AiUsageMonthlyRow = {
      user_id: input.userId,
      period: input.period,
      generation_limit: input.generationLimit,
      generation_count: (existing?.generation_count ?? 0) + (input.generationCountDelta ?? 0),
      committed_generation_count:
        (existing?.committed_generation_count ?? existing?.generation_count ?? 0) + (input.generationCountDelta ?? 0),
      reserved_generation_count: existing?.reserved_generation_count ?? 0,
      provider_cost_micro_usd: existing?.provider_cost_micro_usd ?? '0',
      input_tokens: existing?.input_tokens ?? '0',
      output_tokens: existing?.output_tokens ?? '0',
      failed_call_count: existing?.failed_call_count ?? 0,
      estimated_cost: addNumericStrings(existing?.estimated_cost ?? '0', input.estimatedCostDelta ?? '0'),
      updated_at: new Date(),
    };
    this.monthlyUsage.set(key, row);
    return row;
  }

  async countMonthlyGenerations(userId: string, period: string): Promise<number> {
    return (await this.findMonthlyUsage(userId, period))?.generation_count ?? 0;
  }

  async reserveMonthlyGeneration(input: {
    userId: string;
    period: string;
    generationLimit: number;
  }): Promise<AiUsageMonthlyRow | null> {
    const existing = this.monthlyUsage.get(monthlyUsageKey(input.userId, input.period));
    if ((existing?.generation_count ?? 0) >= input.generationLimit) return null;
    return this.upsertMonthlyUsage({ ...input, generationCountDelta: 1 });
  }

  async releaseMonthlyGeneration(userId: string, period: string): Promise<AiUsageMonthlyRow | null> {
    const existing = this.monthlyUsage.get(monthlyUsageKey(userId, period));
    if (!existing) return null;
    const released = {
      ...existing,
      generation_count: Math.max(0, existing.generation_count - 1),
      committed_generation_count: Math.max(0, existing.committed_generation_count - 1),
      updated_at: new Date(),
    };
    this.monthlyUsage.set(monthlyUsageKey(userId, period), released);
    return released;
  }

  async countActiveJobs(userId: string): Promise<number> {
    return Array.from(this.jobs.values()).filter(
      (job) => job.user_id === userId && (job.status === 'queued' || job.status === 'running'),
    ).length;
  }

  async listCloudProjectsForUser(userId: string): Promise<CloudProjectRow[]> {
    return Array.from(this.projects.values())
      .filter((project) => project.user_id === userId)
      .sort((left, right) => right.updated_at.getTime() - left.updated_at.getTime());
  }

  async upsertCloudProject(input: UpsertCloudProjectInput): Promise<CloudProjectRow> {
    const existing = this.projects.get(input.id);
    if (existing && existing.user_id !== input.userId) {
      throw new CloudProjectOwnershipConflictError(input.id);
    }
    const now = new Date();
    const row: CloudProjectRow = {
      id: input.id,
      user_id: input.userId,
      name: input.name,
      doc_json: input.docJson,
      thumbnail: input.thumbnail ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.projects.set(row.id, row);
    return row;
  }

  async deleteCloudProjectForUser(id: string, userId: string): Promise<boolean> {
    const existing = this.projects.get(id);
    if (!existing || existing.user_id !== userId) return false;
    return this.projects.delete(id);
  }

  repositories(): ApiRepositories {
    return {
      users: {
        findById: (id) => this.findById(id),
        upsertFromAuth: (input) => this.upsertUserFromAuth(input),
        setRole: (id, role) => this.setUserRole(id, role),
      },
      accountTiers: {
        findAccess: (userId) => this.findAccountAccess(userId),
        ensureAccess: (userId) => this.ensureAccountAccess(userId),
        listLegacyAiEnabledUsers: () => this.listLegacyAiEnabledUsers(),
        assignTier: (input) => this.assignTier(input),
        createQuotaGrant: (input) => this.createQuotaGrant(input),
        createQuotaGrantReversal: (input) => this.createQuotaGrantReversal(input),
        findQuotaGrant: (id) => this.findQuotaGrant(id),
        sumQuotaAdjustments: (userId, period) => this.sumQuotaAdjustments(userId, period),
      },
      operations: {
        findById: (id) => this.findOperationById(id),
        countActiveForUser: (userId) => this.countActiveOperationsForUser(userId),
        findByIdempotencyKey: (userId, feature, idempotencyKey) =>
          this.findOperationByIdempotencyKey(userId, feature, idempotencyKey),
        reserve: (input) => this.reserveOperation(input),
        markRunning: (id, startedAt) => this.markOperationRunning(id, startedAt),
        markAwaitingValidation: (id) => this.markOperationAwaitingValidation(id),
        markSucceeded: (id, completedAt) => this.markOperationSucceeded(id, completedAt),
        release: (input) => this.releaseOperation(input),
        reconcile: (input) => this.reconcileOperations(input),
      },
      usageEvents: {
        append: (input) => this.appendUsageEvent(input),
        sumCost: (input) => this.sumUsageEventCost(input),
      },
      adminAudit: {
        append: (input) => this.appendAdminAuditEvent(input),
        lockAction: (action) => this.lockAdminAction(action),
        findByActionEntity: (action, entityId) => this.findAdminAuditByActionEntity(action, entityId),
        findLatestByAction: (action) => this.findLatestAdminAuditByAction(action),
      },
      adminRead: {
        getOverview: (period) => this.getAdminOverview(period),
        listAccounts: (input) => this.listAdminAccounts(input),
        getAccount: (userId, period) => this.getAdminAccount(userId, period),
        listUsage: (input) => this.listAdminUsage(input),
        listReconciliations: (limit) => this.listAdminReconciliations(limit),
      },
      reconciliations: {
        upsert: (input) => this.upsertProviderReconciliation(input),
      },
      jobs: {
        create: (input) => this.createGenerationJob(input),
        findByIdForUser: (id, userId) => this.findGenerationJobByIdForUser(id, userId),
        findByIdempotencyKey: (userId, idempotencyKey) => this.findByIdempotencyKey(userId, idempotencyKey),
        countActiveJobs: (userId) => this.countActiveJobs(userId),
        markRunning: (id, startedAt) => this.markRunning(id, startedAt),
        markSucceeded: (id, outputAssetId, completedAt) => this.markSucceeded(id, outputAssetId, completedAt),
        markCancelled: (id, cancelledAt) => this.markCancelled(id, cancelledAt),
        markFailed: (id, error) => this.markFailed(id, error),
      },
      shaderRequests: {
        claim: (input) => this.claimShaderRequest(input),
        attachOperation: (id, operationId) => this.attachShaderOperation(id, operationId),
        findByIdempotencyKey: (userId, idempotencyKey) => this.findShaderByIdempotencyKey(userId, idempotencyKey),
        findByIdForUser: (id, userId) => this.findShaderByIdForUser(id, userId),
        markGenerated: (input) => this.markShaderGenerated(input),
        markAccepted: (id, candidateRevision, completedAt) =>
          this.acceptShaderRequest(id, candidateRevision, completedAt),
        markClientRejected: (input) => this.rejectShaderRequest(input),
        beginRepair: (id) => this.beginShaderRepair(id),
        completeRepair: (input) => this.completeShaderRepair(input),
        markFailed: (id, error) => this.failShaderRequest(id, error),
      },
      assets: {
        create: (input) => this.createAsset(input),
        findByIdForUser: (id, userId) => this.findAssetByIdForUser(id, userId),
        findProjectAssetByFingerprintForUser: (input) => this.findProjectAssetByFingerprintForUser(input),
        listProjectAssetsForUser: (userId) => this.listProjectAssetsForUser(userId),
        softDelete: (id, userId, deletedAt) => this.softDeleteAsset(id, userId, deletedAt),
        softDeleteManyForUser: (ids, userId, deletedAt) => this.softDeleteAssetsForUser(ids, userId, deletedAt),
      },
      projects: {
        listForUser: (userId) => this.listCloudProjectsForUser(userId),
        upsert: (input) => this.upsertCloudProject(input),
        deleteForUser: (id, userId) => this.deleteCloudProjectForUser(id, userId),
      },
      usage: {
        findMonthlyUsage: (userId, period) => this.findMonthlyUsage(userId, period),
        upsertMonthlyUsage: (input) => this.upsertMonthlyUsage(input),
        reserveMonthlyGeneration: (input) => this.reserveMonthlyGeneration(input),
        releaseMonthlyGeneration: (userId, period) => this.releaseMonthlyGeneration(userId, period),
        countMonthlyGenerations: (userId, period) => this.countMonthlyGenerations(userId, period),
      },
    };
  }

  async createGenerationJob(input: CreateAiGenerationJobInput): Promise<AiGenerationJobRow> {
    if (this.jobs.has(input.id)) throw new Error(`Generation job already exists: ${input.id}`);
    const now = new Date();
    const row: AiGenerationJobRow = {
      id: input.id,
      operation_id: input.operationId ?? null,
      user_id: input.userId,
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? null,
      settings_json: input.settingsJson,
      idempotency_key: input.idempotencyKey,
      status: 'queued',
      output_asset_id: null,
      error_code: null,
      error_message: null,
      retryable: null,
      attempt_count: 0,
      estimated_cost: null,
      provider_usage_json: null,
      created_at: now,
      queued_at: now,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      expires_at: input.expiresAt ?? null,
    };
    this.jobs.set(row.id, row);
    return row;
  }

  private async requireJob(id: string): Promise<AiGenerationJobRow> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Generation job not found: ${id}`);
    return job;
  }
}

function createUsageEventRow(input: CreateAiUsageEventInput): AiUsageEventRow {
  return {
    id: input.id,
    operation_id: input.operationId ?? null,
    user_id: input.userId,
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    status: input.status,
    provider_request_id: input.providerRequestId ?? null,
    usage_json: normalizeProviderUsageMetrics(input.usage),
    cost_micro_usd: normalizeMicroUsd(input.costMicroUsd),
    pricing_version: requiredText(input.pricingVersion, 'pricingVersion'),
    created_at: input.createdAt ?? new Date(),
  };
}

function monthlyUsageKey(userId: string, period: string) {
  return `${userId}:${period}`;
}

function emptyMonthlyUsage(userId: string, period: string, generationLimit: number): AiUsageMonthlyRow {
  return {
    user_id: userId,
    period,
    generation_limit: generationLimit,
    generation_count: 0,
    committed_generation_count: 0,
    reserved_generation_count: 0,
    provider_cost_micro_usd: '0',
    input_tokens: '0',
    output_tokens: '0',
    failed_call_count: 0,
    estimated_cost: '0',
    updated_at: new Date(),
  };
}

function addNumericStrings(a: string, b: string) {
  return String(Number(a) + Number(b));
}

function addIntegerStrings(a: string, b: string) {
  return (BigInt(a) + BigInt(b)).toString();
}

function newestFirst<T extends { created_at: Date }>(left: T, right: T) {
  return right.created_at.getTime() - left.created_at.getTime();
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function monthlyPeriod(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('period must use YYYY-MM');
  return value;
}
