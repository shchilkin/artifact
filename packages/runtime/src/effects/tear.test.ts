import { HEADER, TEAR_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { effectRegistry, tear } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('tear', () => {
  it('registers the editor fragment by reference, uncentred, with pixel parity', () => {
    expect(effectRegistry.get('tear')).toBe(tear);
    expect(tear.fragment).toBe(TEAR_FRAG);
    expect(tear.fragment.startsWith(HEADER)).toBe(true);
    expect(tear.centered).toBe(false);
    // Seeded, but the same fragment and seed as the editor: deterministic at a fixed seed.
    expect(tear.stochastic).toBe(false);
    expect(tear.fields).toEqual(['tearAmt', 'tearSize', 'seedOffset']);
  });

  it('maps the authored fields to the editor uniforms, seeded by the document seed plus the layer offset', () => {
    expect(effectRegistry.pass('tear', { tearAmt: 10, tearSize: 6, seedOffset: 3 }, context)).toEqual({
      id: 'tear',
      fragment: TEAR_FRAG,
      uniforms: { uIntensity: 10 * 0.007, uChunkH: 6 / 1000, uSeed: 45 },
    });
  });

  it('is off at zero, as in the editor filter builder', () => {
    expect(effectRegistry.pass('tear', { tearAmt: 0, tearSize: 6 }, context)).toBeNull();
  });
});
