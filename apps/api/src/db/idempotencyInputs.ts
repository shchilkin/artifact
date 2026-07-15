import { IdempotencyInputConflictError } from './errors.js';
import type {
  AiOperationRow,
  CreateAiOperationInput,
  CreateQuotaGrantInput,
  CreateQuotaGrantReversalInput,
  CreateTierAssignmentInput,
  QuotaGrantReversalRow,
  QuotaGrantRow,
  TierAssignmentRow,
} from './types.js';

export function assertOperationRetry(existing: AiOperationRow, input: CreateAiOperationInput) {
  if (
    existing.reservation_period !== input.reservationPeriod ||
    existing.reserved_generations !== input.reservedGenerations
  ) {
    throw new IdempotencyInputConflictError('AI operation', input.idempotencyKey);
  }
}

export function assertTierAssignmentRetry(existing: TierAssignmentRow, input: CreateTierAssignmentInput) {
  if (
    existing.user_id !== input.userId ||
    existing.previous_tier !== input.expectedTier ||
    existing.new_tier !== input.newTier ||
    existing.reason !== input.reason.trim()
  ) {
    throw new IdempotencyInputConflictError('Tier Assignment', input.idempotencyKey);
  }
}

export function assertQuotaGrantRetry(existing: QuotaGrantRow, input: CreateQuotaGrantInput) {
  if (
    existing.user_id !== input.userId ||
    existing.period !== input.period ||
    existing.amount !== input.amount ||
    existing.reason !== input.reason.trim()
  ) {
    throw new IdempotencyInputConflictError('Quota Grant', input.idempotencyKey);
  }
}

export function assertQuotaGrantReversalRetry(existing: QuotaGrantReversalRow, input: CreateQuotaGrantReversalInput) {
  if (
    existing.grant_id !== input.grantId ||
    existing.amount !== input.amount ||
    existing.reason !== input.reason.trim()
  ) {
    throw new IdempotencyInputConflictError('Quota Grant Reversal', input.idempotencyKey);
  }
}
