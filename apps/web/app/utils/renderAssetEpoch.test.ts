import { afterEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ asset: undefined as { dataUrl: string } | undefined }));

vi.mock('./indexedDb', () => ({
  openIndexedDatabase: vi.fn(),
  requestToPromise: vi.fn(),
  withIndexedDbStore: vi.fn(async () => stored.asset),
}));

import { resolveImageSource } from './assetStore';
import { resolveEnvironmentSource } from './envAssetStore';
import { ensureCanvasFontLoaded } from './fontLoading';
import { ensureImportedFontLoaded } from './fontStore';
import { resolveModelSource } from './modelAssetStore';
import { getRenderAssetEpoch } from './renderAssetEpoch';

async function epochChange(task: () => Promise<unknown>) {
  const before = getRenderAssetEpoch();
  await task();
  return getRenderAssetEpoch() - before;
}

describe('render-asset epoch', () => {
  afterEach(() => {
    stored.asset = undefined;
    vi.unstubAllGlobals();
  });

  it('advances when an image, environment, or model asset is missing from the store', async () => {
    expect(await epochChange(() => resolveImageSource('artifact-asset://missing'))).toBe(1);
    expect(await epochChange(() => resolveEnvironmentSource('artifact-env://missing'))).toBe(1);
    expect(await epochChange(() => resolveModelSource('artifact-model://missing'))).toBe(1);
    expect(await epochChange(() => ensureImportedFontLoaded('artifact-font://missing'))).toBe(1);
  });

  it('stays put when the asset resolves or the source is not a stored asset', async () => {
    stored.asset = { dataUrl: 'data:image/png;base64,AAAA' };
    expect(await epochChange(() => resolveImageSource('artifact-asset://present'))).toBe(0);
    expect(await epochChange(() => resolveEnvironmentSource('artifact-env://present'))).toBe(0);
    expect(await epochChange(() => resolveModelSource('artifact-model://present'))).toBe(0);
    expect(await epochChange(() => resolveImageSource('data:image/png;base64,AAAA'))).toBe(0);
  });

  it('advances when a bundled font fails to load, and not when it loads', async () => {
    vi.stubGlobal('document', { fonts: { load: vi.fn().mockRejectedValue(new Error('offline')) } });
    expect(await epochChange(() => ensureCanvasFontLoaded('ANTON', 64))).toBe(1);

    vi.stubGlobal('document', { fonts: { load: vi.fn().mockResolvedValue([]) } });
    expect(await epochChange(() => ensureCanvasFontLoaded('ANTON', 64))).toBe(0);
    // A loaded font is remembered, so later renders do not load it again.
    expect(await epochChange(() => ensureCanvasFontLoaded('ANTON', 64))).toBe(0);
  });
});
