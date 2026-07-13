import type { AccountTier } from '@artifact/shared';

export interface AccountTierMigrationUser {
  id: string;
  email: string | null;
  aiEnabled: boolean;
}

export interface PlannedTierAssignment {
  userId: string;
  email: string | null;
  tier: AccountTier;
}

export interface AccountTierMigrationReport {
  mode: 'dry-run';
  totalAccounts: number;
  founderAccountId: string;
  plannedAssignments: PlannedTierAssignment[];
  legacyAiEnabledReview: Array<{ userId: string; email: string | null }>;
}

export function buildAccountTierMigrationReport(
  users: readonly AccountTierMigrationUser[],
  founderAccountId: string,
): AccountTierMigrationReport {
  if (!users.some((user) => user.id === founderAccountId)) {
    throw new Error(`Founder account not found: ${founderAccountId}`);
  }

  const ordered = [...users].sort((left, right) => left.id.localeCompare(right.id));
  return {
    mode: 'dry-run',
    totalAccounts: ordered.length,
    founderAccountId,
    plannedAssignments: ordered.map((user) => ({
      userId: user.id,
      email: user.email,
      tier: user.id === founderAccountId ? 'founder' : 'free',
    })),
    legacyAiEnabledReview: ordered
      .filter((user) => user.aiEnabled && user.id !== founderAccountId)
      .map((user) => ({ userId: user.id, email: user.email })),
  };
}
