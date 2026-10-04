import { HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { effectRegistry, GLITCH_FRAG, GLITCH_MAX_BANDS, glitch, glitchBands } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

// The editor's first five draws for effect seed 42 (`lcg(42 ^ 0x1a2b3c)` in apps/web/app/utils/lcg.ts).
const EDITOR_DRAWS_SEED_42 = [
  0.9316886637825519, 0.3091506250202656, 0.18017983040772378, 0.06827738927677274, 0.6574538929853588,
];

describe('glitch', () => {
  it('registers the port uncentred, with pixel parity', () => {
    expect(effectRegistry.get('glitch')).toBe(glitch);
    expect(glitch.fragment).toBe(GLITCH_FRAG);
    expect(glitch.fragment.startsWith(HEADER)).toBe(true);
    expect(glitch.fragment).not.toMatch(/uCenter/);
    expect(glitch.centered).toBe(false);
    expect(glitch.stochastic).toBe(false);
    expect(glitch.fields).toEqual(['glitch', 'seedOffset']);
  });

  it("draws the editor's first band from the editor's LCG stream", () => {
    const [y, h, x, w, opacity] = EDITOR_DRAWS_SEED_42;
    const bands = glitchBands(1, 42);
    expect(bands.count).toBe(1);
    expect(bands.rects.slice(0, 4)).toEqual([x * 0.3, y, x * 0.3 + (0.3 + w * 0.7), 1 + h * 3]);
    expect(bands.opacities[0]).toBe(0.12 + opacity * 0.25);
    expect(bands.rects).toHaveLength(GLITCH_MAX_BANDS * 4);
    expect(bands.opacities).toHaveLength(GLITCH_MAX_BANDS);
    expect(bands.rects.slice(4).every((value) => value === 0)).toBe(true);
  });

  it('draws ceil(glitch) bands, as the editor loop does, capped at the shader limit', () => {
    expect(glitchBands(14, 42).count).toBe(14);
    expect(glitchBands(14.2, 42).count).toBe(15);
    expect(glitchBands(140, 42).count).toBe(GLITCH_MAX_BANDS);
    // More bands extend the same stream: the first bands stay put.
    expect(glitchBands(20, 42).rects.slice(0, 56)).toEqual(glitchBands(14, 42).rects.slice(0, 56));
  });

  it('seeds from the document seed plus the layer offset', () => {
    const pass = effectRegistry.pass('glitch', { glitch: 14, seedOffset: 7 }, context);
    const bands = glitchBands(14, 49);
    expect(pass).toEqual({
      id: 'glitch',
      fragment: GLITCH_FRAG,
      uniforms: { uCount: 14, uBands: bands.rects, uOpacity: bands.opacities },
    });
    expect(pass?.uniforms.uBands).not.toEqual(glitchBands(14, 42).rects);
  });

  it('is off at zero, as in the editor', () => {
    expect(effectRegistry.pass('glitch', { glitch: 0 }, context)).toBeNull();
    expect(glitchBands(0, 42).count).toBe(0);
  });
});
