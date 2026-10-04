import { describe, expect, it } from 'vitest';
import { EFFECT_CASES } from '../../../../../packages/runtime/test/cases/index';
import {
  catalogueBindings,
  catalogueControls,
  catalogueLayer,
  catalogueTitle,
  formatGpuTime,
  pointerInputs,
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

  it('lists time and the inputs a case samples as its bindings', () => {
    expect(catalogueBindings(EFFECT_CASES.noiseWarp)).toEqual(['time', 'pointer.speed', 'pointer.x', 'pointer.y']);
    expect(catalogueBindings(undefined)).toEqual([]);
    expect(catalogueBindings({ effect: 'x', layer: {}, frames: [{ name: 't', t: 0.5 }] })).toEqual([]);
  });

  it('maps a pointer to 0..1 inputs from the top left, with speed clamped', () => {
    expect(pointerInputs(135, 0, 270, 270, 1)).toEqual({ 'pointer.x': 0.5, 'pointer.y': 0, 'pointer.speed': 0.5 });
    expect(pointerInputs(-10, 300, 270, 270, 9)).toEqual({ 'pointer.x': 0, 'pointer.y': 1, 'pointer.speed': 1 });
  });

  it('formats GPU time', () => {
    expect(formatGpuTime(undefined)).toBe('measuring');
    expect(formatGpuTime(null)).toBe('n/a');
    expect(formatGpuTime(0.1834)).toBe('0.18 ms');
  });
});
