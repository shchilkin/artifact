import { describe, expect, it, vi } from 'vitest';

import { registerArtifactServiceWorker } from './pwaRegistration';

describe('registerArtifactServiceWorker', () => {
  it('skips registration when disabled', async () => {
    const register = vi.fn();

    await expect(
      registerArtifactServiceWorker({
        enabled: false,
        navigatorRef: { serviceWorker: { register } } as never,
      }),
    ).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers the production service worker with root scope', async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);

    await expect(
      registerArtifactServiceWorker({
        enabled: true,
        navigatorRef: { serviceWorker: { register } } as never,
      }),
    ).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });
});
