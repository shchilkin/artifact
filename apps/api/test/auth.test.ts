import { describe, expect, it } from 'vitest';
import { computeAiAccessResponse, readBearerToken, resolveRequestUser } from '../src/auth.js';

describe('auth helpers', () => {
  it('reads bearer tokens from plain request headers', () => {
    expect(readBearerToken({ headers: { Authorization: 'Bearer token-123' } })).toBe('token-123');
  });

  it('resolves users through an injected bearer verifier', async () => {
    await expect(
      resolveRequestUser(
        { headers: { authorization: 'Bearer token-123' } },
        {
          verifyBearerToken: (token) => (token === 'token-123' ? { id: 'user-1' } : null),
        },
      ),
    ).resolves.toEqual({
      authenticated: true,
      token: 'token-123',
      user: { id: 'user-1' },
    });
  });

  it('computes access responses with quota exhaustion reason', () => {
    expect(
      computeAiAccessResponse({
        aiEnabled: true,
        auth: { authenticated: true, user: { id: 'user-1' } },
        quota: { period: '2026-05', limit: 3, used: 3, remaining: 0 },
      }),
    ).toMatchObject({
      authenticated: true,
      disabledReason: 'quota_exhausted',
      enabled: false,
      user: { id: 'user-1' },
    });
  });
});
