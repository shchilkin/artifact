import { describe, expect, it, vi } from 'vitest';
import { applyCorsHeaders } from '../src/http.js';

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
    expect(res.setHeader).toHaveBeenCalledWith('vary', 'Origin');
    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-methods', 'GET,POST,OPTIONS');
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
    expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-methods', 'GET,POST,OPTIONS');
  });
});
