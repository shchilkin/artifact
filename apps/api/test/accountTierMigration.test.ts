import { describe, expect, it } from 'vitest';
import { buildAccountTierMigrationReport } from '../src/accountTierMigration.js';

describe('account tier migration dry run', () => {
  it('plans Founder by exact id, defaults others to Free, and isolates legacy AI review', () => {
    expect(
      buildAccountTierMigrationReport(
        [
          { id: 'user-b', email: 'b@example.com', aiEnabled: true },
          { id: 'founder-id', email: 'founder@example.com', aiEnabled: true },
          { id: 'user-a', email: 'a@example.com', aiEnabled: false },
        ],
        'founder-id',
      ),
    ).toEqual({
      mode: 'dry-run',
      totalAccounts: 3,
      founderAccountId: 'founder-id',
      plannedAssignments: [
        { userId: 'founder-id', email: 'founder@example.com', tier: 'founder' },
        { userId: 'user-a', email: 'a@example.com', tier: 'free' },
        { userId: 'user-b', email: 'b@example.com', tier: 'free' },
      ],
      legacyAiEnabledReview: [{ userId: 'user-b', email: 'b@example.com' }],
    });
  });

  it('fails closed when the exact founder account does not exist', () => {
    expect(() =>
      buildAccountTierMigrationReport([{ id: 'user-1', email: null, aiEnabled: false }], 'missing-founder'),
    ).toThrow('Founder account not found: missing-founder');
  });
});
