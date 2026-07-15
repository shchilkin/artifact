import type { AccountAllowanceSnapshot, AccountTier, AccountTierPolicy } from '@artifact/shared';

const TIER_POLICIES: Readonly<Record<AccountTier, AccountTierPolicy>> = {
  free: { providerAiEnabled: false, monthlyGenerationLimit: 0, maxActiveOperations: 0 },
  creator: { providerAiEnabled: true, monthlyGenerationLimit: 20, maxActiveOperations: 3 },
  founder: { providerAiEnabled: true, monthlyGenerationLimit: null, maxActiveOperations: 15 },
};

export interface CalculateAccountAllowanceInput {
  tier: AccountTier;
  period: string;
  committedGenerations: number;
  reservedGenerations: number;
  grantedGenerations: number;
  reversedGenerations: number;
}

export function getAccountTierPolicy(tier: AccountTier): AccountTierPolicy {
  return TIER_POLICIES[tier];
}

export function calculateAccountAllowance(input: CalculateAccountAllowanceInput): AccountAllowanceSnapshot {
  const committed = nonNegativeInteger(input.committedGenerations, 'committedGenerations');
  const reserved = nonNegativeInteger(input.reservedGenerations, 'reservedGenerations');
  const granted = nonNegativeInteger(input.grantedGenerations, 'grantedGenerations');
  const reversed = nonNegativeInteger(input.reversedGenerations, 'reversedGenerations');
  if (reversed > granted) throw new Error('reversedGenerations cannot exceed grantedGenerations');

  const policy = getAccountTierPolicy(input.tier);
  const limit = policy.monthlyGenerationLimit === null ? null : policy.monthlyGenerationLimit + granted - reversed;

  return {
    tier: input.tier,
    period: input.period,
    providerAiEnabled: policy.providerAiEnabled,
    baseLimit: policy.monthlyGenerationLimit,
    granted,
    reversed,
    limit,
    committed,
    reserved,
    remaining: limit === null ? null : Math.max(0, limit - committed - reserved),
  };
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}
