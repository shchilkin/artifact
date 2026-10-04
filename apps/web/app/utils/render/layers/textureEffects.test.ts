import { beforeEach, describe, expect, it } from 'vitest';
import { makeEffectPresetLayer } from '../../../types/config';
import { applyGrain, resetGrainTextureCache } from './textureEffects';

function grainPixels(grain: number, seed: number) {
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
  beforeEach(() => resetGrainTextureCache());

  it('draws the same pixels from a cached grain texture as from a freshly built one', () => {
    const fresh = grainPixels(40, 7);
    const cached = grainPixels(40, 7);
    // Fill the cache past its limit with other textures, so the first one is rebuilt.
    for (const seed of [1, 2, 3, 4, 5]) grainPixels(40, seed);
    const rebuilt = grainPixels(40, 7);

    expect(cached).toEqual(fresh);
    expect(rebuilt).toEqual(fresh);
  });

  it('keys the texture by seed and amount', () => {
    const base = grainPixels(40, 7);

    expect(grainPixels(40, 8)).not.toEqual(base);
    expect(grainPixels(41, 7)).not.toEqual(base);
  });
});
