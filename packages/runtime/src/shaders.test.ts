import { HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { COPY_FRAGMENT, inputClamp, PASS_VERTEX } from './shaders.js';

describe('Pixi-compatible shader inputs', () => {
  it('insets inputClamp by half a texel of the input, as Pixi does', () => {
    expect(inputClamp(540, 270)).toEqual([0.5 / 540, 0.5 / 270, 1 - 0.5 / 540, 1 - 0.5 / 270]);
  });

  it('pairs GLSL ES 1.00 fragments with a GLSL ES 1.00 vertex shader that writes vTextureCoord', () => {
    expect(PASS_VERTEX).not.toContain('#version');
    expect(PASS_VERTEX).toContain('varying vec2 vTextureCoord;');
    expect(COPY_FRAGMENT.startsWith(HEADER)).toBe(true);
  });
});
