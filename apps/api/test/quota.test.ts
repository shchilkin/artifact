import { describe, expect, it } from 'vitest';
import { checkMonthlyQuota, checkOneActiveJob, getMonthlyQuotaPeriod } from '../src/quota.js';

describe('quota helpers', () => {
  it('uses UTC monthly periods', () => {
    expect(getMonthlyQuotaPeriod(new Date('2026-05-31T23:59:59.000Z'))).toBe('2026-05');
  });

  it('checks monthly quota from an injected reader', async () => {
    await expect(
      checkMonthlyQuota({
        limit: 5,
        usageReader: { countMonthlyGenerations: () => 4 },
        userId: 'user-1',
        period: '2026-05',
      }),
    ).resolves.toEqual({
      allowed: true,
      quota: { period: '2026-05', limit: 5, used: 4, remaining: 1 },
    });
  });

  it('rejects when the user already has the maximum active jobs', async () => {
    await expect(
      checkOneActiveJob({
        activeJobs: 1,
        maxActiveJobs: 1,
        userId: 'user-1',
      }),
    ).resolves.toEqual({
      activeJobs: 1,
      allowed: false,
      maxActiveJobs: 1,
    });
  });
});
