import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeAiAccessResponse,
  createClerkBearerVerifier,
  createJwtBearerVerifier,
  readBearerToken,
  resolveRequestUser,
  verifySignedBearerToken,
} from '../src/auth.js';

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

  it('verifies signed HS256 bearer tokens', () => {
    const token = createTestJwt(
      {
        sub: 'user-1',
        email: 'me@example.com',
        role: 'admin',
        iss: 'artifact-web',
        aud: 'artifact-api',
        exp: 1_779_293_600,
      },
      'secret',
    );

    expect(
      verifySignedBearerToken(token, {
        secret: 'secret',
        issuer: 'artifact-web',
        audience: 'artifact-api',
        now: () => new Date('2026-05-20T10:00:00.000Z'),
      }),
    ).toEqual({
      id: 'user-1',
      email: 'me@example.com',
      role: 'admin',
    });
  });

  it('rejects invalid or expired JWT bearer tokens', () => {
    const token = createTestJwt({ sub: 'user-1', exp: 1 }, 'secret');

    expect(
      verifySignedBearerToken(token, {
        secret: 'secret',
        now: () => new Date('2026-05-20T10:00:00.000Z'),
      }),
    ).toBeNull();
    expect(
      verifySignedBearerToken(`${token.slice(0, -1)}x`, {
        secret: 'secret',
        now: () => new Date('2026-05-20T10:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('creates an injected bearer verifier for request resolution', async () => {
    const token = createTestJwt({ sub: 'user-1', exp: 1_779_293_600 }, 'secret');

    await expect(
      resolveRequestUser(
        { headers: { authorization: `Bearer ${token}` } },
        {
          verifyBearerToken: createJwtBearerVerifier({
            secret: 'secret',
            now: () => new Date('2026-05-20T10:00:00.000Z'),
          }),
        },
      ),
    ).resolves.toMatchObject({
      authenticated: true,
      user: { id: 'user-1' },
    });
  });

  it('ignores Clerk bearer verification when Clerk keys are not configured', async () => {
    await expect(createClerkBearerVerifier({})('not-a-clerk-token')).resolves.toBeNull();
  });
});

function createTestJwt(payload: Record<string, unknown>, secret: string) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
