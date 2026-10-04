import { HEADER } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface RippleLayer {
  readonly rippleAmt: number;
  readonly rippleFreq: number;
  /**
   * Runtime-only phase of the rings, in turns (the editor has no such field). The editor's rings sit at phase 0; a
   * rising phase moves them outward, one wavelength per turn, so a whole number of turns per loop closes it.
   */
  readonly ripplePhase?: number;
  /**
   * Runtime-only click impulse, 0..1 (bind `click` to it). Above zero, a ring packet starts at `uClickCenter` and
   * travels outward as the impulse decays; 0 (the default, and every editor layer) draws no click ring.
   */
  readonly rippleClick?: number;
  readonly seedOffset?: number;
}

/**
 * The click impulse's decay time constant in seconds (`click` in `createPointerModel`, default `clickDecay`). The
 * shader recovers the ring's age from the impulse, `age = −τ ln(click)`, so the binding must pass the impulse through
 * unsmoothed and unscaled.
 */
export const RIPPLE_CLICK_DECAY = 0.5;

/** How fast a click ring's front travels, in frame half-diagonals per second. */
export const RIPPLE_CLICK_SPEED = 1.5;

/**
 * Ripple, ported from the editor's CPU path (`applyRipple` in
 * `apps/web/app/utils/render/workers/effectPixelTransform.ts`, run from `applyCanvas2DEffects`), which the editor
 * keeps. Per pixel `(x, y)` of the image data, with the centre `c = (W / 2, H / 2)`, `maxDist = |c|` (the
 * half-diagonal) and the render scale `W / 540`:
 *
 * - `dist`, `angle` = the polar offset of `(x, y)` from `c` (at the centre, angle 0);
 * - `shift = sin(dist × rippleFreq × 2π / maxDist) × rippleAmt × scale × 0.5`;
 * - the pixel is copied from `round(c + (dist + shift) × (cos angle, sin angle))`, each axis clamped to the image.
 *   Nearest pixels, no filtering; every channel (alpha too) moves together.
 *
 * The port does the same per fragment with whole-pixel coordinates and texel-centre samples (exact under linear
 * filtering); a premultiplied texel is the same pixel, so no unpremultiply is needed. The sine runs on the fractional
 * ring count (`fract(dist × rippleFreq / maxDist − phase)`), which keeps its argument small for float precision. The
 * render size comes from `inputClamp`, which the chain insets by half a texel. The centre is `uCenter` (default the
 * middle, as the editor's fixed centre); `maxDist` stays the frame's half-diagonal when it moves.
 *
 * Two runtime-only additions leave the editor's output unchanged at their defaults:
 *
 * - `uRipplePhase` (turns, default 0) moves the rings outward;
 * - `uRippleClick` (the click impulse, default 0) adds a packet of rings around `uClickCenter`, with the same
 *   wavelength and peak shift as the authored rings times the impulse. Its front is `age × RIPPLE_CLICK_SPEED`
 *   half-diagonals from the click, where `age = −RIPPLE_CLICK_DECAY × ln(impulse)`, and a Gaussian envelope one
 *   wavelength wide keeps it a packet. The packet's radial shift adds to the editor's before rounding.
 *
 * Uniforms: `uRippleAmt` (the authored amount at 540px), `uRippleFreq`, `uRipplePhase`, `uRippleClick`, `uCenter`,
 * `uClickCenter`.
 */
export const RIPPLE_FRAG = `${HEADER}
// Whole-pixel coordinates at 1080px need more than mediump's 10-bit mantissa.
precision highp float;
uniform float uRippleAmt;
uniform float uRippleFreq;
uniform float uRipplePhase;
uniform float uRippleClick;
uniform vec2 uCenter;
uniform vec2 uClickCenter;

const float RIPPLE_TAU = 6.283185307179586;
const float RIPPLE_CLICK_DECAY = ${RIPPLE_CLICK_DECAY.toFixed(4)};
const float RIPPLE_CLICK_SPEED = ${RIPPLE_CLICK_SPEED.toFixed(4)};

vec4 rippleTexel(vec2 pixel, vec2 size) {
  return texture2D(uSampler, (pixel + 0.5) / size);
}

// The unit heading from centre to pixel, as (cos, sin) of the editor's atan2 (angle 0 at the centre).
vec2 rippleHeading(vec2 offset, float dist) {
  return dist > 0.0 ? offset / dist : vec2(1.0, 0.0);
}

void main() {
  vec2 size = floor(0.5 / inputClamp.xy + 0.5);
  vec2 pixel = floor(vTextureCoord * size);
  float maxShift = uRippleAmt * size.x / 540.0 * 0.5;
  if (maxShift <= 0.0) {
    gl_FragColor = rippleTexel(pixel, size);
    return;
  }
  float maxDist = length(size * 0.5);
  vec2 centre = uCenter * size;
  vec2 offset = pixel - centre;
  float dist = length(offset);
  float rings = dist * uRippleFreq / maxDist - uRipplePhase;
  float shift = sin(fract(rings) * RIPPLE_TAU) * maxShift;
  vec2 source = centre + rippleHeading(offset, dist) * (dist + shift);
  if (uRippleClick > 0.0) {
    float wavelength = maxDist / max(uRippleFreq, 0.01);
    float front = -RIPPLE_CLICK_DECAY * log(min(uRippleClick, 1.0)) * RIPPLE_CLICK_SPEED * maxDist;
    vec2 clickOffset = pixel - uClickCenter * size;
    float clickDist = length(clickOffset);
    float behind = (clickDist - front) / wavelength;
    float packet = uRippleClick * maxShift * exp(-behind * behind) * sin(fract(behind) * RIPPLE_TAU);
    source += rippleHeading(clickOffset, clickDist) * packet;
  }
  vec2 last = size - 1.0;
  gl_FragColor = rippleTexel(clamp(floor(source + 0.5), vec2(0.0), last), size);
}`;

/**
 * Ripple, a GLSL port of the editor's CPU remap, centred on `uCenter`. `ripplePhase` makes the rings travel and
 * `rippleClick` (with `uClickCenter`) starts a ring packet at a click; both are off at rest.
 */
export const ripple = defineEffect<RippleLayer>({
  id: 'ripple',
  fragment: RIPPLE_FRAG,
  fields: ['rippleAmt', 'rippleFreq', 'ripplePhase', 'rippleClick'],
  amount: (layer) => layer.rippleAmt,
  uniforms: (layer) => ({
    uRippleAmt: layer.rippleAmt,
    uRippleFreq: layer.rippleFreq,
    uRipplePhase: layer.ripplePhase ?? 0,
    uRippleClick: Math.min(1, Math.max(0, layer.rippleClick ?? 0)),
    uClickCenter: [0.5, 0.5],
  }),
  centered: true,
  stochastic: false,
});
