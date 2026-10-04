import { describe, expect, it } from 'vitest';
import { EFFECT_CASES } from '../../../../../packages/runtime/test/cases/index';
import {
  catalogueBindings,
  catalogueControls,
  catalogueLayer,
  catalogueTitle,
  formatGpuTime,
} from './runtimeCatalogueModel';

describe('runtime catalogue model', () => {
  it("uses the editor's name and inspector controls for an effect", () => {
    expect(catalogueTitle('noiseWarp')).toBe('Noise Warp');
    expect(catalogueControls('noiseWarp')).toEqual([
      expect.objectContaining({ type: 'slider', field: 'noiseWarp', min: 0, max: 100 }),
    ]);
  });

  it('falls back to the id and no controls for an effect the editor does not know', () => {
    expect(catalogueTitle('unknown')).toBe('unknown');
    expect(catalogueControls('unknown')).toEqual([]);
    expect(catalogueLayer('unknown', undefined)).toBeNull();
  });

  it("starts from the editor preset with the harness case's values", () => {
    const layer = catalogueLayer('noiseWarp', EFFECT_CASES.noiseWarp);
    expect(layer).toMatchObject({ kind: 'effect', preset: 'noiseWarp', noiseWarp: 90, seedOffset: 0 });
  });

  it("lists each source of a case's bindings once", () => {
    expect(catalogueBindings(EFFECT_CASES.noiseWarp)).toEqual([
      'wave track',
      'pointer.x',
      'pointer.y',
      'pointer.speed',
    ]);
    expect(catalogueBindings(undefined)).toEqual([]);
    expect(catalogueBindings({ effect: 'x', layer: {} })).toEqual([]);
  });

  it('formats GPU time', () => {
    expect(formatGpuTime(undefined)).toBe('measuring');
    expect(formatGpuTime(null)).toBe('n/a');
    expect(formatGpuTime(0.1834)).toBe('0.18 ms');
  });
});
