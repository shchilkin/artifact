import { randomUUID } from 'node:crypto';
import type { AccountAllowanceSnapshot, AiOperationFeature } from '@artifact/shared';
import { calculateAccountAllowance, getAccountTierPolicy } from './accountAccess.js';
import { isActiveAiOperationExistsError } from './db/errors.js';
import type { ApiRepositories } from './db/repositories.js';
import type { AiOperationRow, ReleaseAiOperationInput } from './db/types.js';
import { getMonthlyQuotaPeriod } from './quota.js';

const UNBOUNDED_GENERATION_LIMIT = 2_147_483_647;

export type AccountAccessDenialCode = 'tier_ai_unavailable' | 'allowance_exhausted' | 'operation_in_progress';

export type ReserveAccountOperationResult =
  | { ok: true; operation: AiOperationRow; claimed: boolean; allowance: AccountAllowanceSnapshot }
  | { ok: false; code: AccountAccessDenialCode; allowance: AccountAllowanceSnapshot };

export interface AccountAccessServiceOptions {
  now?: () => Date;
  createId?: () => string;
}

export class AccountAccessService {
  constructor(
    private readonly repositories: ApiRepositories,
    private readonly options: AccountAccessServiceOptions = {},
  ) {}

  async getAllowance(userId: string): Promise<AccountAllowanceSnapshot> {
    const period = getMonthlyQuotaPeriod(this.options.now?.());
    const [access, adjustments, usage] = await Promise.all([
      this.repositories.accountTiers.ensureAccess(userId),
      this.repositories.accountTiers.sumQuotaAdjustments(userId, period),
      this.repositories.usage.findMonthlyUsage(userId, period),
    ]);
    return calculateAccountAllowance({
      tier: access.tier,
      period,
      committedGenerations: usage?.committed_generation_count ?? usage?.generation_count ?? 0,
      reservedGenerations: usage?.reserved_generation_count ?? 0,
      grantedGenerations: adjustments.granted,
      reversedGenerations: adjustments.reversed,
    });
  }

  async reserve(input: {
    userId: string;
    feature: AiOperationFeature;
    idempotencyKey: string;
  }): Promise<ReserveAccountOperationResult> {
    const allowance = await this.getAllowance(input.userId);
    if (!allowance.providerAiEnabled) return { ok: false, code: 'tier_ai_unavailable', allowance };
    if (allowance.remaining !== null && allowance.remaining <= 0) {
      return { ok: false, code: 'allowance_exhausted', allowance };
    }
    const policy = getAccountTierPolicy(allowance.tier);
    try {
      const reservation = await this.repositories.operations.reserve({
        id: this.options.createId?.() ?? randomUUID(),
        userId: input.userId,
        feature: input.feature,
        idempotencyKey: input.idempotencyKey,
        reservationPeriod: allowance.period,
        reservedGenerations: 1,
        generationLimit: allowance.limit ?? UNBOUNDED_GENERATION_LIMIT,
        maxActiveOperations: policy.maxActiveOperations,
      });
      if (!reservation)
        return { ok: false, code: 'allowance_exhausted', allowance: await this.getAllowance(input.userId) };
      return {
        ok: true,
        operation: reservation.row,
        claimed: reservation.claimed,
        allowance: await this.getAllowance(input.userId),
      };
    } catch (error) {
      if (isActiveAiOperationExistsError(error)) {
        return { ok: false, code: 'operation_in_progress', allowance: await this.getAllowance(input.userId) };
      }
      throw error;
    }
  }

  markRunning(operationId: string) {
    return this.repositories.operations.markRunning(operationId, this.options.now?.() ?? new Date());
  }

  markAwaitingValidation(operationId: string) {
    return this.repositories.operations.markAwaitingValidation(operationId);
  }

  commit(operationId: string) {
    return this.repositories.operations.markSucceeded(operationId, this.options.now?.() ?? new Date());
  }

  release(operationId: string, status: ReleaseAiOperationInput['status'], errorCode?: string | null) {
    return this.repositories.operations.release({
      id: operationId,
      status,
      errorCode,
      completedAt: this.options.now?.() ?? new Date(),
    });
  }
}
