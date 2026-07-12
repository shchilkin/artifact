import type { MaybePromise } from './auth.js';
import type { AiQuotaSnapshot } from './contracts.js';

export interface QuotaUsageReader {
  countMonthlyGenerations(userId: string, period: string): MaybePromise<number>;
}

export interface ActiveJobReader {
  countActiveJobs(userId: string): MaybePromise<number>;
}

export interface MonthlyQuotaCheck {
  allowed: boolean;
  quota: AiQuotaSnapshot;
}

export interface CheckMonthlyQuotaOptions {
  limit: number;
  now?: Date;
  period?: string;
  used?: number;
  usageReader?: QuotaUsageReader;
  userId: string;
}

export interface ActiveJobCheck {
  allowed: boolean;
  activeJobs: number;
  maxActiveJobs: number;
}

export interface CheckActiveJobOptions {
  activeJobs?: number;
  activeJobReader?: ActiveJobReader;
  maxActiveJobs: number;
  userId: string;
}

export function getMonthlyQuotaPeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }

  return Math.floor(value);
}

export function createQuotaSnapshot(period: string, limit: number, used: number): AiQuotaSnapshot {
  const normalizedLimit = normalizeNonNegativeInteger(limit, 'limit');
  const normalizedUsed = normalizeNonNegativeInteger(used, 'used');

  return {
    period,
    limit: normalizedLimit,
    used: normalizedUsed,
    remaining: Math.max(0, normalizedLimit - normalizedUsed),
  };
}

export async function checkMonthlyQuota(options: CheckMonthlyQuotaOptions): Promise<MonthlyQuotaCheck> {
  const period = options.period ?? getMonthlyQuotaPeriod(options.now);
  const used = options.used ?? (await options.usageReader?.countMonthlyGenerations(options.userId, period)) ?? 0;
  const quota = createQuotaSnapshot(period, options.limit, used);

  return {
    allowed: quota.remaining !== null && quota.remaining > 0,
    quota,
  };
}

export async function checkOneActiveJob(options: CheckActiveJobOptions): Promise<ActiveJobCheck> {
  const maxActiveJobs = normalizeNonNegativeInteger(options.maxActiveJobs, 'maxActiveJobs');
  const activeJobs = options.activeJobs ?? (await options.activeJobReader?.countActiveJobs(options.userId)) ?? 0;
  const normalizedActiveJobs = normalizeNonNegativeInteger(activeJobs, 'activeJobs');

  return {
    allowed: normalizedActiveJobs < maxActiveJobs,
    activeJobs: normalizedActiveJobs,
    maxActiveJobs,
  };
}
