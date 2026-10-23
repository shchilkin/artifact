import { describe, expect, it, vi } from 'vitest';
import { makeEffectLayer, ZERO_EFFECT } from '../types/config';
import { CANVAS_POSITIVE_EFFECT_KEYS } from './render/layers';

vi.mock('pixi.js', () => ({
  Filter: class Filter {},
  BlurFilter: class BlurFilter {},
}));

describe('buildFiltersFromEffectLayer', () => {
  it.each(CANVAS_POSITIVE_EFFECT_KEYS)('adds no GPU filter for canvas-owned effect %s', async (key) => {
    const { buildFiltersFromEffectLayer } = await import('./pixiFilters');
    const layer = makeEffectLayer({ ...ZERO_EFFECT, [key]: 20 });

    expect(buildFiltersFromEffectLayer(layer, 1, 540, 540) ?? []).toHaveLength(0);
  });
});
