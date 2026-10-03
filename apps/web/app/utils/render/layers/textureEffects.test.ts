import { describe, expect, it, vi } from 'vitest';
import { makeEffectPresetLayer } from '../../../types/config';

function grainPixels(applyGrain: typeof import('./textureEffects').applyGrain, grain: number, seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5a3c8c';
  ctx.fillRect(0, 0, 24, 16);
  applyGrain(ctx, 24, 16, makeEffectPresetLayer('grain', { grain }), seed);
  return Array.from(ctx.getImageData(0, 0, 24, 16).data);
}

describe('applyGrain', () => {
  it('draws the same pixels from a cached grain texture as from a freshly built one', async () => {
    vi.resetModules();
    const fresh = await import('./textureEffects');
    const first = grainPixels(fresh.applyGrain, 40, 7);
    const cachedRepeat = grainPixels(fresh.applyGrain, 40, 7);

    vi.resetModules();
    const rebuilt = await import('./textureEffects');
    // Fill the cache past its limit with other textures, then rebuild the first one.
    for (const seed of [1, 2, 3, 4, 5]) grainPixels(rebuilt.applyGrain, 40, seed);
    const afterEviction = grainPixels(rebuilt.applyGrain, 40, 7);

    expect(cachedRepeat).toEqual(first);
    expect(afterEviction).toEqual(first);
  });

  it('keys the texture by seed and amount', async () => {
    const { applyGrain } = await import('./textureEffects');
    const base = grainPixels(applyGrain, 40, 7);

    expect(grainPixels(applyGrain, 40, 8)).not.toEqual(base);
    expect(grainPixels(applyGrain, 41, 7)).not.toEqual(base);
  });
});
