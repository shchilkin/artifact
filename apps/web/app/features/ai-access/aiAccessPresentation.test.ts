import { describe, expect, it } from 'vitest';
import { aiAccessReasonBody, aiAccessReasonTitle, aiAccessUsageLabel } from './aiAccessPresentation';

describe('AI access presentation', () => {
  it('explains occupied account capacity without queue terminology', () => {
    const access = {
      authenticated: true,
      enabled: false,
      disabledReason: 'operation_in_progress' as const,
      operations: { active: 3, limit: 3, remaining: 0 },
    };

    expect(aiAccessReasonTitle(access.disabledReason)).toBe('AI capacity is in use');
    expect(aiAccessReasonBody(access.disabledReason, access)).toBe(
      'All 3 AI creation slots are in use. Wait for one to finish, then try again.',
    );
  });

  it('summarizes finite and unlimited monthly usage', () => {
    expect(
      aiAccessUsageLabel({
        authenticated: true,
        enabled: true,
        quota: { period: '2026-07', limit: 20, used: 2, remaining: 18 },
      }),
    ).toBe('18 of 20 left');
    expect(
      aiAccessUsageLabel({
        authenticated: true,
        enabled: true,
        quota: { period: '2026-07', limit: null, used: 4, remaining: null },
      }),
    ).toBe('4 used');
  });
});
