import type { AiGenerationAccessState } from '../../types/aiGeneration';

const REASON_MESSAGES: Partial<Record<string, string>> = {
  anonymous: 'Account required.',
  invalid_session: 'Account session could not be verified.',
  tier_ai_unavailable: 'AI creation is not included for this account.',
  allowance_exhausted: 'Monthly AI allowance used.',
  operation_in_progress: 'AI creation capacity is in use.',
  ai_budget_exhausted: 'AI creation is temporarily paused.',
  maintenance: 'AI creation is temporarily unavailable.',
};

const REASON_TITLES: Partial<Record<string, string>> = {
  anonymous: 'Account required for AI',
  invalid_session: 'Account verification failed',
  tier_ai_unavailable: 'AI creation is not included',
  allowance_exhausted: 'Monthly AI allowance used',
  operation_in_progress: 'AI capacity is in use',
  ai_budget_exhausted: 'AI creation is paused',
  maintenance: 'AI creation is paused',
};

const REASON_BODIES: Partial<Record<string, string>> = {
  anonymous: 'Sign in to create with AI.',
  invalid_session: 'Sign out, sign in again, and retry.',
  tier_ai_unavailable: 'You can keep editing, but AI creation is unavailable for this account.',
  allowance_exhausted: 'This account has used its AI creations for the current month.',
  operation_in_progress: 'Wait for a current creation to finish, then try again.',
  ai_budget_exhausted: 'The shared AI budget is paused. Your existing work is unchanged.',
  maintenance: 'AI creation is temporarily unavailable. Your existing work is unchanged.',
};

export function aiAccessReasonMessage(reason: string | null | undefined) {
  if (!reason) return null;
  return REASON_MESSAGES[reason] ?? 'AI creation is unavailable right now.';
}

export function aiAccessReasonTitle(reason: string | null | undefined) {
  return (reason && REASON_TITLES[reason]) || 'AI creation unavailable';
}

export function aiAccessReasonBody(reason: string | null | undefined, access?: AiGenerationAccessState | null) {
  if (reason === 'operation_in_progress' && access?.operations?.limit) {
    return `All ${access.operations.limit} AI creation slots are in use. Wait for one to finish, then try again.`;
  }
  if (reason === 'allowance_exhausted' && access?.quota?.resetAt) {
    return `This account has used its AI creations for the current month. The allowance renews ${formatResetDate(
      access.quota.resetAt,
    )}.`;
  }
  return (reason && REASON_BODIES[reason]) || aiAccessReasonMessage(reason) || 'AI creation is unavailable right now.';
}

export function aiAccessUsageLabel(access: AiGenerationAccessState | null | undefined) {
  if (!access?.quota) return null;
  const quota = access.quota;
  return quota.limit === null ? `${quota.used} used` : `${quota.remaining} of ${quota.limit} left`;
}

function formatResetDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'next month';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}
