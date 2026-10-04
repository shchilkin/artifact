import { DATAMOSH_FRAG, HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { dataMosh, effectRegistry } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('dataMosh', () => {
  it('registers the editor fragment by reference, uncentred, with pixel parity', () => {
    expect(effectRegistry.get('dataMosh')).toBe(dataMosh);
    expect(dataMosh.fragment).toBe(DATAMOSH_FRAG);
    expect(dataMosh.fragment.startsWith(HEADER)).toBe(true);
    expect(dataMosh.fragment).not.toMatch(/uCenter/);
    expect(dataMosh.centered).toBe(false);
    // Seeded, but the same fragment and seed as the editor: deterministic at a fixed seed.
    expect(dataMosh.stochastic).toBe(false);
    expect(dataMosh.fields).toEqual(['dataMosh', 'seedOffset']);
  });

  it('maps the authored fields to the editor uniforms, seeded by the document seed plus the layer offset', () => {
    expect(effectRegistry.pass('dataMosh', { dataMosh: 30, seedOffset: 7 }, context)).toEqual({
      id: 'dataMosh',
      fragment: DATAMOSH_FRAG,
      uniforms: { uIntensity: 30 * 0.007, uSeed: 49 },
    });
    expect(effectRegistry.pass('dataMosh', { dataMosh: 60 }, context)?.uniforms).toEqual({
      uIntensity: 60 * 0.007,
      uSeed: 42,
    });
  });

  it('is off at zero, as in the editor filter builder', () => {
    expect(effectRegistry.pass('dataMosh', { dataMosh: 0 }, context)).toBeNull();
  });
});
