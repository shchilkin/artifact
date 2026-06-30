import { describe, expect, it } from 'vitest';
import { createTrustedOriginsResolver } from '../src/betterAuth.js';

describe('createTrustedOriginsResolver', () => {
  it('returns exact origins only when no request origin is available', () => {
    const resolveTrustedOrigins = createTrustedOriginsResolver([
      'https://artifact.shchilkin.dev',
      'https://artifact-*-shchilkins-projects.vercel.app',
    ]);

    expect(resolveTrustedOrigins()).toEqual(['https://artifact.shchilkin.dev']);
  });

  it('returns the exact request origin after matching an allowed preview wildcard', () => {
    const resolveTrustedOrigins = createTrustedOriginsResolver([
      'https://artifact.shchilkin.dev',
      'https://artifact-*-shchilkins-projects.vercel.app',
    ]);

    expect(
      resolveTrustedOrigins(
        new Request('https://api.artifact.shchilkin.dev/api/auth/sign-in/email', {
          headers: {
            origin: 'https://artifact-eblxdafr1-shchilkins-projects.vercel.app',
          },
        }),
      ),
    ).toEqual(['https://artifact-eblxdafr1-shchilkins-projects.vercel.app']);
  });

  it('rejects origins that Better Auth wildcard matching would otherwise accept', () => {
    const resolveTrustedOrigins = createTrustedOriginsResolver(['https://artifact-*-shchilkins-projects.vercel.app']);

    expect(
      resolveTrustedOrigins(
        new Request('https://api.artifact.shchilkin.dev/api/auth/sign-in/email', {
          headers: {
            origin: 'https://artifact-preview.evil-shchilkins-projects.vercel.app',
          },
        }),
      ),
    ).toEqual([]);
  });
});
