import { HEADER } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface CaLayer {
  readonly ca: number;
  readonly seedOffset?: number;
}

/**
 * Radial chromatic aberration, ported from the editor's CPU path (`applyChromaticAberration` in
 * `apps/web/app/utils/render/workers/effectPixelTransform.ts`), which the editor keeps. The editor scales the
 * authored amount to the render size and rounds it to whole pixels (`round(ca × W / 540)`), then, per pixel `(x, y)`
 * on the unpremultiplied image data:
 *
 * - `d = ((x, y) − (W / 2, H / 2)) / maxDist`, where `maxDist` is the centre-to-corner distance, so `d` runs from 0
 *   at the centre to 1 in the corners;
 * - red comes from the pixel at `round((x, y) + d × amount)`, blue from `round((x, y) − d × amount)`, both clamped
 *   to the image; green and alpha stay. Nearest pixels, no filtering.
 *
 * The port does the same per fragment: whole-pixel coordinates, the same rounding and clamping, texel-centre samples
 * (exact under linear filtering), and the colour unpremultiplied before it is recombined with the pixel's own alpha.
 * The render size comes from `inputClamp`, which the chain insets by half a texel. The centre is `uCenter` (default
 * the middle, as the editor's fixed centre); `maxDist` stays the frame's half diagonal when the centre moves, so the
 * fringe keeps its strength.
 *
 * Uniforms: `uCa` (the authored amount at 540px), `uCenter`.
 */
export const CA_FRAG = `${HEADER}
// Whole-pixel coordinates at 1080px need more than mediump's 10-bit mantissa.
precision highp float;
uniform float uCa;
uniform vec2 uCenter;

vec4 caTexel(vec2 pixel, vec2 size) {
  return texture2D(uSampler, (pixel + 0.5) / size);
}

vec3 caUnpremultiply(vec4 colour) {
  return colour.a > 0.0 ? colour.rgb / colour.a : vec3(0.0);
}

void main() {
  vec2 size = floor(0.5 / inputClamp.xy + 0.5);
  vec2 pixel = floor(vTextureCoord * size);
  vec4 own = caTexel(pixel, size);
  float amount = floor(uCa * size.x / 540.0 + 0.5);
  if (amount <= 0.0) {
    gl_FragColor = own;
    return;
  }
  vec2 d = (pixel - uCenter * size) / length(size * 0.5);
  vec2 last = size - 1.0;
  vec2 redPixel = clamp(floor(pixel + d * amount + 0.5), vec2(0.0), last);
  vec2 bluePixel = clamp(floor(pixel - d * amount + 0.5), vec2(0.0), last);
  float red = caUnpremultiply(caTexel(redPixel, size)).r;
  float green = caUnpremultiply(own).g;
  float blue = caUnpremultiply(caTexel(bluePixel, size)).b;
  gl_FragColor = vec4(vec3(red, green, blue) * own.a, own.a);
}`;

/** Radial chromatic aberration, a GLSL port of the editor's CPU colour pass step, centred on `uCenter`. */
export const ca = defineEffect<CaLayer>({
  id: 'ca',
  fragment: CA_FRAG,
  fields: ['ca'],
  amount: (layer) => layer.ca,
  uniforms: (layer) => ({ uCa: layer.ca }),
  centered: true,
  stochastic: false,
});
