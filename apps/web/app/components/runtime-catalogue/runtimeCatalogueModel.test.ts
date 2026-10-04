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

  it('shows Grain with its inspector slider and the step track that boils it', () => {
    expect(catalogueTitle('grain')).toBe('Grain');
    expect(catalogueControls('grain')).toEqual([
      expect.objectContaining({ type: 'slider', field: 'grain', min: 0, max: 50 }),
    ]);
    expect(catalogueLayer('grain', EFFECT_CASES.grain)).toMatchObject({ preset: 'grain', grain: 40, seedOffset: 0 });
    expect(catalogueBindings(EFFECT_CASES.grain)).toEqual(['step track']);
  });

  it('shows Scanlines with its inspector sliders, the step track that crawls it and scroll', () => {
    expect(catalogueTitle('scanlines')).toBe('Scanlines');
    expect(catalogueControls('scanlines')).toEqual([
      expect.objectContaining({ type: 'slider', field: 'scanlines', min: 0, max: 100 }),
      expect.objectContaining({ type: 'slider', field: 'scanlineWidth', min: 1, max: 12 }),
    ]);
    expect(catalogueLayer('scanlines', EFFECT_CASES.scanlines)).toMatchObject({
      preset: 'scanlines',
      scanlines: 35,
      scanlineWidth: 3,
    });
    expect(catalogueBindings(EFFECT_CASES.scanlines)).toEqual(['step track', 'scroll']);
  });

  it('formats GPU time', () => {
    expect(formatGpuTime(undefined)).toBe('measuring');
    expect(formatGpuTime(null)).toBe('n/a');
    expect(formatGpuTime(0.1834)).toBe('0.18 ms');
  });

  it('lists Vortex with its amount slider and the pointer bindings', () => {
    expect(catalogueTitle('vortex')).toBe('Vortex');
    expect(catalogueControls('vortex')).toEqual([expect.objectContaining({ type: 'slider', field: 'vortex' })]);
    expect(catalogueLayer('vortex', EFFECT_CASES.vortex)).toMatchObject({ preset: 'vortex', vortex: 50 });
    expect(catalogueBindings(EFFECT_CASES.vortex)).toEqual(['wave track', 'pointer.x', 'pointer.y', 'hover']);
  });

  it('lists Liquid Morph with its amount and frequency sliders and its bindings', () => {
    expect(catalogueTitle('morph')).toBe('Morph');
    expect(catalogueControls('morph')).toEqual([
      expect.objectContaining({ type: 'slider', field: 'morphAmt' }),
      expect.objectContaining({ type: 'slider', field: 'morphFreq' }),
    ]);
    expect(catalogueLayer('morph', EFFECT_CASES.morph)).toMatchObject({ preset: 'morph', morphAmt: 20, morphFreq: 5 });
    expect(catalogueBindings(EFFECT_CASES.morph)).toEqual(['wave track', 'pointer.speed']);
  });
  it('lists radial chromatic aberration with its amount slider and the pointer bindings', () => {
    expect(catalogueTitle('ca')).toBe('Chrom. Ab.');
    expect(catalogueControls('ca')).toEqual([expect.objectContaining({ type: 'slider', field: 'ca' })]);
    expect(catalogueLayer('ca', EFFECT_CASES.ca)).toMatchObject({ preset: 'ca', ca: 15 });
    expect(catalogueBindings(EFFECT_CASES.ca)).toEqual(['wave track', 'pointer.x', 'pointer.y', 'pointer.speed']);
  });

  it('lists Data Mosh with its amount slider, the step and pulse tracks and click', () => {
    expect(catalogueTitle('dataMosh')).toBe('Data Mosh');
    expect(catalogueControls('dataMosh')).toEqual([expect.objectContaining({ type: 'slider', field: 'dataMosh' })]);
    expect(catalogueLayer('dataMosh', EFFECT_CASES.dataMosh)).toMatchObject({ preset: 'dataMosh', dataMosh: 30 });
    expect(catalogueBindings(EFFECT_CASES.dataMosh)).toEqual(['step track', 'pulse track', 'click']);
  });

  it('lists Tear with its amount and size sliders, the step track and click', () => {
    expect(catalogueTitle('tear')).toBe('Tear');
    expect(catalogueControls('tear')).toEqual([
      expect.objectContaining({ type: 'slider', field: 'tearAmt' }),
      expect.objectContaining({ type: 'slider', field: 'tearSize' }),
    ]);
    expect(catalogueLayer('tear', EFFECT_CASES.tear)).toMatchObject({ preset: 'tear', tearAmt: 10, tearSize: 6 });
    expect(catalogueBindings(EFFECT_CASES.tear)).toEqual(['step track', 'pulse track', 'click']);
  });
});
