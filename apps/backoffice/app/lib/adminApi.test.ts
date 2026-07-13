import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApiError, adminApi, currentUtcPeriod, readPositiveInteger } from './adminApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adminApi', () => {
  it('builds encoded account and query URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: { id: 'user/1' },
          tierAssignments: [],
          quotaGrants: [],
          quotaGrantReversals: [],
          audit: [],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await adminApi.account('user/1', '2026-07');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/api/admin/accounts/user%2F1?period=2026-07',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('surfaces stable API errors to route boundaries and mutations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'admin_access_denied',
            message: 'Admin access is required.',
          }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    await expect(adminApi.overview('2026-07')).rejects.toEqual(
      new AdminApiError(403, 'admin_access_denied', 'Admin access is required.'),
    );
  });

  it('turns network failures into a stable service message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(adminApi.overview('2026-07')).rejects.toEqual(
      new AdminApiError(503, 'admin_service_unreachable', 'Could not connect to the Artifact account service.'),
    );
  });

  it('validates period and positive integer helpers deterministically', () => {
    expect(currentUtcPeriod(new Date('2026-07-13T10:00:00.000Z'))).toBe('2026-07');
    expect(readPositiveInteger('4')).toBe(4);
    expect(readPositiveInteger('0')).toBeNull();
    expect(readPositiveInteger('1.5')).toBeNull();
  });
});
