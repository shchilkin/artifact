import { HEADER, NORM_UV, PIXELATE_SAMPLE, SAMPLE } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface PixelateLayer {
  /** Block size in pixels at the render width, as in the editor. */
  readonly pixelate: number;
  /**
   * Runtime-only reveal radius, in frame widths (the editor has no such field). Within it, around `uCenter`, the image
   * is sharp; 0 (the default, and every editor layer) reveals nothing, so the whole frame is the editor's pixelation.
   */
  readonly pixelateRadius?: number;
  /**
   * Runtime-only width of the band beyond the reveal radius, in frame widths, over which blocks grow from sharp to the
   * authored size. Default `PIXELATE_SOFTNESS`; 0 is a hard edge.
   */
  readonly pixelateSoftness?: number;
  readonly seedOffset?: number;
}

/** Default reveal band width, in frame widths. */
export const PIXELATE_SOFTNESS = 0.2;

/** Block sizes across the reveal band: a pixel's block is a whole number of eighths of the authored block. */
export const PIXELATE_REVEAL_LEVELS = 8;

/**
 * Pixelate with a reveal mask. Beyond the band every pixel runs the editor's lookup with `uBlocks` exactly as
 * `PIXELATE_FRAG` does (`PIXELATE_SAMPLE`, shared with it), so with `uRadius = 0` the output is the editor's.
 *
 * With `uRadius > 0`, `reveal = smoothstep(uRadius, uRadius + uSoftness, d)`, where `d` is the pixel's distance from
 * `uCenter` in frame widths (the height scaled by the aspect from `inputClamp`). Inside the radius `reveal` is 0 and
 * the pixel samples itself; across the band its block is `ceil(reveal × levels) / levels` of the authored block, so
 * the image gets blockier in rings with distance from the centre.
 *
 * `uBlocks = 0` (a binding that drives `pixelate` to 0, where the editor would drop the filter) samples every pixel
 * in place.
 *
 * Uniforms: `uBlocks` (the editor's), `uCenter`, `uRadius`, `uSoftness`.
 */
export const PIXELATE_REVEAL_FRAG = `${HEADER}
uniform float uBlocks;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uSoftness;

const float PIXELATE_LEVELS = ${PIXELATE_REVEAL_LEVELS.toFixed(1)};

void main() {
  ${NORM_UV}
  float blocks = uBlocks;
  if (blocks <= 0.0) {
    gl_FragColor = ${SAMPLE('norm')};
    return;
  }
  if (uRadius > 0.0) {
    // inputClamp.xy is half a texel of the input, so its ratio is the input's height over its width.
    vec2 offset = (norm - uCenter) * vec2(1.0, inputClamp.x / inputClamp.y);
    float dist = length(offset);
    float reveal = uSoftness > 0.0 ? smoothstep(uRadius, uRadius + uSoftness, dist) : step(uRadius, dist);
    if (reveal <= 0.0) {
      gl_FragColor = ${SAMPLE('norm')};
      return;
    }
    float level = ceil(reveal * PIXELATE_LEVELS) / PIXELATE_LEVELS;
    if (level < 1.0) blocks = uBlocks / level;
  }
  ${PIXELATE_SAMPLE('blocks')}
}`;

/**
 * Pixelate, with the editor's uniform mapping, `uBlocks = max(2, round(width / pixelate))`, and a runtime-only reveal
 * mask around `uCenter` (`pixelateRadius`, `pixelateSoftness`), off at rest.
 */
export const pixelate = defineEffect<PixelateLayer>({
  id: 'pixelate',
  fragment: PIXELATE_REVEAL_FRAG,
  fields: ['pixelate', 'pixelateRadius', 'pixelateSoftness'],
  amount: (layer) => layer.pixelate,
  uniforms: (layer, context) => ({
    // The editor drops the filter at 0; a bound pass that reaches 0 draws the image unchanged instead.
    uBlocks: layer.pixelate > 0 ? Math.max(2, Math.round(context.width / layer.pixelate)) : 0,
    uRadius: Math.max(0, layer.pixelateRadius ?? 0),
    uSoftness: Math.max(0, layer.pixelateSoftness ?? PIXELATE_SOFTNESS),
  }),
  centered: true,
  stochastic: false,
});
