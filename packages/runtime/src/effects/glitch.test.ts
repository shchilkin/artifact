import { HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { effectRegistry, GLITCH_FRAG, GLITCH_MAX_BANDS, glitch, glitchBands, glitchUniforms } from './index.js';

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
    expect(glitchBands(1, 42)).toEqual([
      {
        left: x * 0.3,
        right: x * 0.3 + 0.3 + w * 0.7,
        top: y,
        height: 1 + h * 3,
        opacity: 0.12 + opacity * 0.25,
        magenta: false,
      },
    ]);
  });

  it('draws ceil(glitch) bands, as the editor loop does, alternating cyan and magenta, capped at the shader limit', () => {
    expect(glitchBands(14, 42)).toHaveLength(14);
    expect(glitchBands(14.2, 42)).toHaveLength(15);
    expect(glitchBands(140, 42)).toHaveLength(GLITCH_MAX_BANDS);
    expect(glitchBands(4, 42).map((band) => band.magenta)).toEqual([false, true, false, true]);
    // More bands extend the same stream: the first bands stay put.
    expect(glitchBands(20, 42).slice(0, 14)).toEqual(glitchBands(14, 42));
  });

  it('packs the bands sorted by top edge, with the colour in the opacity and unused slots below the image', () => {
    const bands = glitchBands(14, 42);
    const { uBands, uOpacity } = glitchUniforms(bands);
    expect(uBands).toHaveLength(GLITCH_MAX_BANDS * 4);
    expect(uOpacity).toHaveLength(GLITCH_MAX_BANDS);
    const tops = Array.from({ length: 14 }, (_, i) => uBands[i * 4 + 1]);
    expect(tops).toEqual(bands.map((band) => band.top).sort((a, b) => a - b));
    const first = bands.find((band) => band.top === tops[0])!;
    expect(uBands.slice(0, 4)).toEqual([first.left, first.top, first.right, first.height]);
    expect(uOpacity[0]).toBe(first.opacity + (first.magenta ? 1 : 0));
    expect(uBands[14 * 4 + 1]).toBe(2);
    expect(uBands[GLITCH_MAX_BANDS * 4 - 3]).toBe(2);
    expect(uOpacity.slice(14).every((value) => value === 0)).toBe(true);
  });

  it('seeds from the document seed plus the layer offset', () => {
    const pass = effectRegistry.pass('glitch', { glitch: 14, seedOffset: 7 }, context);
    expect(pass).toEqual({ id: 'glitch', fragment: GLITCH_FRAG, uniforms: glitchUniforms(glitchBands(14, 49)) });
    expect(pass?.uniforms.uBands).not.toEqual(glitchUniforms(glitchBands(14, 42)).uBands);
  });

  it('is off at zero, as in the editor', () => {
    expect(effectRegistry.pass('glitch', { glitch: 0 }, context)).toBeNull();
    expect(glitchBands(0, 42)).toEqual([]);
  });
});
