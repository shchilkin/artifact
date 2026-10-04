import { HEADER, MORPH_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { effectRegistry, morph } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('morph', () => {
  it('registers the editor fragment by reference, not centred and deterministic', () => {
    expect(effectRegistry.get('morph')).toBe(morph);
    expect(morph.fragment).toBe(MORPH_FRAG);
    expect(morph.fragment.startsWith(HEADER)).toBe(true);
    expect(morph.fragment).not.toMatch(/uCenter/);
    expect(morph.centered).toBe(false);
    expect(morph.stochastic).toBe(false);
    expect(morph.fields).toEqual(['morphAmt', 'morphFreq', 'seedOffset']);
  });

  it('maps the authored fields to the editor uniforms, with the layer seed', () => {
    expect(effectRegistry.pass('morph', { morphAmt: 30, morphFreq: 5, seedOffset: 7 }, context)).toEqual({
      id: 'morph',
      fragment: MORPH_FRAG,
      uniforms: { uIntensity: 30 * 0.05, uFreq: 5, uSeed: 49 },
    });
    expect(effectRegistry.pass('morph', { morphAmt: 10, morphFreq: 12 }, context)?.uniforms).toEqual({
      uIntensity: 10 * 0.05,
      uFreq: 12,
      uSeed: 42,
    });
  });

  it('is off at zero amount, as in the editor filter builder', () => {
    expect(effectRegistry.pass('morph', { morphAmt: 0, morphFreq: 5 }, context)).toBeNull();
  });
});
