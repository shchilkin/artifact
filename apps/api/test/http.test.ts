import { describe, expect, it, vi } from 'vitest';
import { applyCorsHeaders, isAllowedWebOrigin } from '../src/http.js';

describe('applyCorsHeaders', () => {
  it('allows credentialed requests from the configured web origin', () => {
    const res = { setHeader: vi.fn() };

    applyCorsHeaders(
      { headers: { origin: 'https://artifact.example' } } as Parameters<typeof applyCorsHeaders>[0],
      res as unknown as Parameters<typeof applyCorsHeaders>[1],
      'https://artifact.example',
    );

    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-origin', 'https://artifact.example');
    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-credentials', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('access-control-expose-headers', 'set-auth-token');
    expect(res.setHeader).toHaveBeenCalledWith('vary', 'Origin');
    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-headers', 'authorization,content-type');
  });

  it('does not echo unconfigured origins', () => {
    const res = { setHeader: vi.fn() };

    applyCorsHeaders(
      { headers: { origin: 'https://not-artifact.example' } } as Parameters<typeof applyCorsHeaders>[0],
      res as unknown as Parameters<typeof applyCorsHeaders>[1],
      'https://artifact.example',
    );

    expect(res.setHeader).not.toHaveBeenCalledWith('access-control-allow-origin', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  });

  it('allows any exact origin from the configured list', () => {
    const res = { setHeader: vi.fn() };

    applyCorsHeaders(
      { headers: { origin: 'https://artifact-preview.example' } } as Parameters<typeof applyCorsHeaders>[0],
      res as unknown as Parameters<typeof applyCorsHeaders>[1],
      ['https://artifact.example', 'https://artifact-preview.example'],
    );

    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-origin', 'https://artifact-preview.example');
  });
});

describe('isAllowedWebOrigin', () => {
  it('matches Vercel preview wildcard origins by one host label', () => {
    expect(isAllowedWebOrigin('https://artifact-git-feature-shchilkin.vercel.app', 'https://*.vercel.app')).toBe(true);
  });

  it('does not match suffix spoofing or nested host labels', () => {
    expect(
      isAllowedWebOrigin('https://artifact-git-feature-shchilkin.vercel.app.evil.example', 'https://*.vercel.app'),
    ).toBe(false);
    expect(isAllowedWebOrigin('https://feature.artifact.vercel.app', 'https://*.vercel.app')).toBe(false);
  });
});
