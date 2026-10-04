import { HEADER, PIXELATE_FRAG, PIXELATE_SAMPLE } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER } from '../registry.js';
import { effectRegistry, PIXELATE_REVEAL_FRAG, PIXELATE_SOFTNESS, pixelate } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('pixelate', () => {
  it('registers a reveal fragment around the editor lookup, centred and deterministic', () => {
    expect(effectRegistry.get('pixelate')).toBe(pixelate);
    expect(pixelate.fragment).toBe(PIXELATE_REVEAL_FRAG);
    expect(PIXELATE_REVEAL_FRAG.startsWith(HEADER)).toBe(true);
    // The editor fragment and the runtime one share the cell lookup; the runtime calls it with a per-pixel count.
    expect(PIXELATE_FRAG).toContain(PIXELATE_SAMPLE('uBlocks'));
    expect(PIXELATE_REVEAL_FRAG).toContain(PIXELATE_SAMPLE('blocks'));
    expect(PIXELATE_REVEAL_FRAG).toMatch(/float blocks = uBlocks;/);
    expect(pixelate.fragment).toMatch(/uniform\s+vec2\s+uCenter\s*;/);
    expect(pixelate.centered).toBe(true);
    expect(pixelate.stochastic).toBe(false);
    expect(pixelate.fields).toEqual(['pixelate', 'pixelateRadius', 'pixelateSoftness']);
  });

  it('keeps the editor fragment as it was', () => {
    expect(PIXELATE_FRAG).toBe(`${HEADER}
uniform float uBlocks;

void main() {
  
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;

  vec2 px      = floor(norm * uBlocks) / uBlocks + 0.5 / uBlocks;
  vec2 warped  = clamp(px, 0.0, 1.0);
  gl_FragColor = texture2D(uSampler, clamp(inputClamp.xy + warped * extent, inputClamp.xy, inputClamp.zw));
}`);
  });

  it('maps the block size as the editor does, with the reveal off', () => {
    expect(effectRegistry.pass('pixelate', { pixelate: 6 }, context)).toEqual({
      id: 'pixelate',
      fragment: PIXELATE_REVEAL_FRAG,
      uniforms: { uCenter: DEFAULT_CENTER, uBlocks: 90, uRadius: 0, uSoftness: PIXELATE_SOFTNESS },
    });
    expect(effectRegistry.uniforms('pixelate', { pixelate: 7 }, context)).toMatchObject({ uBlocks: 77 });
    expect(effectRegistry.uniforms('pixelate', { pixelate: 7 }, { ...context, width: 1080 })).toMatchObject({
      uBlocks: 154,
    });
    // At least two blocks, as the editor clamps it.
    expect(effectRegistry.uniforms('pixelate', { pixelate: 400 }, context)).toMatchObject({ uBlocks: 2 });
  });

  it('passes the runtime-only reveal fields through, never negative', () => {
    expect(
      effectRegistry.uniforms('pixelate', { pixelate: 6, pixelateRadius: 0.2, pixelateSoftness: 0 }, context),
    ).toMatchObject({ uRadius: 0.2, uSoftness: 0 });
    expect(
      effectRegistry.uniforms('pixelate', { pixelate: 6, pixelateRadius: -1, pixelateSoftness: -1 }, context),
    ).toMatchObject({ uRadius: 0, uSoftness: 0 });
  });

  it('is off at zero, as in the editor filter builder, and draws the image unchanged when a binding reaches zero', () => {
    expect(effectRegistry.pass('pixelate', { pixelate: 0 }, context)).toBeNull();
    expect(effectRegistry.uniforms('pixelate', { pixelate: 0 }, context)).toMatchObject({ uBlocks: 0 });
  });
});
