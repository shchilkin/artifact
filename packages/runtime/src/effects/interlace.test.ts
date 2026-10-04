import { HEADER, INTERLACE_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { effectRegistry, interlace } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('interlace', () => {
  it('registers the editor fragment by reference, uncentred, with pixel parity', () => {
    expect(effectRegistry.get('interlace')).toBe(interlace);
    expect(interlace.fragment).toBe(INTERLACE_FRAG);
    expect(interlace.fragment.startsWith(HEADER)).toBe(true);
    expect(interlace.fragment).not.toMatch(/uCenter/);
    expect(interlace.centered).toBe(false);
    // Seeded, but the same fragment and seed as the editor: deterministic at a fixed seed.
    expect(interlace.stochastic).toBe(false);
    expect(interlace.fields).toEqual(['interlace', 'seedOffset']);
  });

  it('maps the authored fields to the editor uniforms, seeded by the document seed plus the layer offset', () => {
    expect(effectRegistry.pass('interlace', { interlace: 40, seedOffset: 7 }, context)).toEqual({
      id: 'interlace',
      fragment: INTERLACE_FRAG,
      uniforms: { uIntensity: 40 * 0.003, uSeed: 49, uResY: 540 },
    });
  });

  it('counts rows at the render height, as the editor passes its canvas height', () => {
    expect(
      effectRegistry.pass('interlace', { interlace: 20 }, { seed: 3, width: 1080, height: 720 })?.uniforms,
    ).toEqual({ uIntensity: 20 * 0.003, uSeed: 3, uResY: 720 });
  });

  it('is off at zero, as in the editor filter builder', () => {
    expect(effectRegistry.pass('interlace', { interlace: 0 }, context)).toBeNull();
  });
});
