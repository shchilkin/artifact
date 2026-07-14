import { describe, expect, it } from 'vitest';
import { calculateAccountAllowance, getAccountTierPolicy } from '../src/accountAccess.js';

describe('account access policy', () => {
  it('keeps provider-backed AI unavailable on Free independently of allowance math', () => {
    expect(getAccountTierPolicy('free')).toEqual({
      providerAiEnabled: false,
      monthlyGenerationLimit: 0,
      maxActiveOperations: 0,
    });
  });

  it('defines active AI operation limits per tier', () => {
    expect(getAccountTierPolicy('creator')).toMatchObject({ maxActiveOperations: 3 });
    expect(getAccountTierPolicy('founder')).toMatchObject({ maxActiveOperations: 15 });
  });

  it('derives Creator remaining allowance from policy, grants, reversals, committed work, and reservations', () => {
    expect(
      calculateAccountAllowance({
        tier: 'creator',
        period: '2026-07',
        committedGenerations: 7,
        reservedGenerations: 2,
        grantedGenerations: 5,
        reversedGenerations: 1,
      }),
    ).toEqual({
      tier: 'creator',
      period: '2026-07',
      providerAiEnabled: true,
      baseLimit: 20,
      granted: 5,
      reversed: 1,
      limit: 24,
      committed: 7,
      reserved: 2,
      remaining: 15,
    });
  });

  it('keeps Founder unbounded while still reporting committed and reserved work', () => {
    expect(
      calculateAccountAllowance({
        tier: 'founder',
        period: '2026-07',
        committedGenerations: 120,
        reservedGenerations: 1,
        grantedGenerations: 0,
        reversedGenerations: 0,
      }),
    ).toEqual({
      tier: 'founder',
      period: '2026-07',
      providerAiEnabled: true,
      baseLimit: null,
      granted: 0,
      reversed: 0,
      limit: null,
      committed: 120,
      reserved: 1,
      remaining: null,
    });
  });

  it('reports zero remaining instead of revoking results after a reversal creates overage', () => {
    expect(
      calculateAccountAllowance({
        tier: 'creator',
        period: '2026-07',
        committedGenerations: 24,
        reservedGenerations: 0,
        grantedGenerations: 5,
        reversedGenerations: 5,
      }).remaining,
    ).toBe(0);
  });

  it('rejects invalid counters and reversals larger than grants', () => {
    expect(() =>
      calculateAccountAllowance({
        tier: 'creator',
        period: '2026-07',
        committedGenerations: 0,
        reservedGenerations: 0,
        grantedGenerations: 1,
        reversedGenerations: 2,
      }),
    ).toThrow('reversedGenerations cannot exceed grantedGenerations');
  });
});
