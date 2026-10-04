import { HEADER } from '@artifact/shared/effect-shaders';
import { defineEffect, type EffectContext, effectLayerSeed } from '../registry.js';

export interface GlitchLayer {
  readonly glitch: number;
  readonly seedOffset?: number;
}

/** The editor's reference width: band heights scale with the render width over it (`scale = W / REF`). */
const REF = 540;

/** Bands the shader can draw. The editor's control runs 0–100; a binding that drives it higher draws 100. */
export const GLITCH_MAX_BANDS = 100;

/**
 * The editor's seeded random stream (`lcg` in `apps/web/app/utils/lcg.ts`), copied so the runtime draws the same
 * numbers: 32-bit LCG, a uniform draw in [0, 1) per call.
 */
export function glitchLcg(seed: number): () => number {
  let s = (seed ^ 0x12345678) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface GlitchBands {
  /** Bands drawn, `ceil(glitch)` capped at `GLITCH_MAX_BANDS`. */
  readonly count: number;
  /**
   * Four floats per band: left and top as fractions of the width and height, right as a fraction of the width, and
   * the height in reference pixels (`1 + 3u`, multiplied by `W / 540` in the shader). Padded to `GLITCH_MAX_BANDS`.
   */
  readonly rects: readonly number[];
  /** One opacity per band, packed four to a `vec4`. Padded to `GLITCH_MAX_BANDS`. */
  readonly opacities: readonly number[];
}

/**
 * The bands the editor draws for a glitch amount and effect seed (`doc.global.seed + seedOffset`): the same LCG,
 * seeded as `applyEffectLayerCanvas2DEffects` seeds the layer's Canvas 2D stream (`effectSeed ^ 0x1a2b3c`), with the
 * same five draws per band in the same order. Glitch is the first Canvas 2D effect to read that stream when the layer
 * has no light rays, which is the only way a glitch layer runs live (rays are not registered).
 */
export function glitchBands(glitch: number, effectSeed: number): GlitchBands {
  const count = glitch > 0 ? Math.min(GLITCH_MAX_BANDS, Math.ceil(glitch)) : 0;
  const rects = new Array<number>(GLITCH_MAX_BANDS * 4).fill(0);
  const opacities = new Array<number>(GLITCH_MAX_BANDS).fill(0);
  const rng = glitchLcg(effectSeed ^ 0x1a2b3c);
  for (let i = 0; i < count; i += 1) {
    // Editor: y = u·H; h = (1 + 3u)·scale; x = u·W·0.3; w = W·(0.3 + 0.7u); opacity = 0.12 + 0.25u.
    const y = rng();
    const h = 1 + rng() * 3;
    const x = rng() * 0.3;
    const w = 0.3 + rng() * 0.7;
    rects[i * 4] = x;
    rects[i * 4 + 1] = y;
    rects[i * 4 + 2] = x + w;
    rects[i * 4 + 3] = h;
    opacities[i] = 0.12 + rng() * 0.25;
  }
  return { count, rects, opacities };
}

/**
 * VHS streaks (Glitch), ported from the editor's Canvas 2D path (`applyGlitchEffect` in
 * `apps/web/app/utils/render/layers/index.ts`), which the editor keeps. The editor draws `glitch` rectangles with
 * `fillRect` in `screen` blend, alternating `rgba(0, 210, 255, a)` and `rgba(255, 0, 200, a)`; each band's position,
 * height, width and opacity come from five draws of the layer's seeded LCG.
 *
 * Only a hundred bands at most, so the CPU runs the editor's LCG per seed (`glitchBands`) and the shader gets the
 * rectangles as uniforms: the bands land exactly where the editor's do, at any seed. Per fragment the shader takes
 * each band's analytic pixel coverage, as the canvas anti-aliases a fractional rectangle, and composites it in order
 * with the premultiplied screen blend (`s + d − s·d`, which also covers transparent backdrops), rounding to bytes
 * after each band as the canvas stores them. The render size comes from `inputClamp`.
 *
 * Uniforms: `uCount`, `uBands` (`vec4[100]`), `uOpacity` (`vec4[25]`).
 */
export const GLITCH_FRAG = `${HEADER}
// Pixel coordinates and coverage at 1080px need more than mediump's 10-bit mantissa.
precision highp float;
uniform float uCount;
uniform vec4 uBands[${GLITCH_MAX_BANDS}];
uniform vec4 uOpacity[${GLITCH_MAX_BANDS / 4}];

void main() {
  vec2 size = floor(0.5 / inputClamp.xy + 0.5);
  vec2 pixel = floor(vTextureCoord * size);
  vec4 colour = texture2D(uSampler, (pixel + 0.5) / size);
  float scale = size.x / ${REF.toFixed(1)};
  for (int i = 0; i < ${GLITCH_MAX_BANDS}; i++) {
    if (float(i) >= uCount) break;
    vec4 band = uBands[i];
    vec2 lo = vec2(band.x * size.x, band.y * size.y);
    vec2 hi = vec2(band.z * size.x, lo.y + band.w * scale);
    vec2 overlap = clamp(min(pixel + 1.0, hi) - max(pixel, lo), 0.0, 1.0);
    float coverage = overlap.x * overlap.y;
    if (coverage <= 0.0) continue;
    // GLSL ES 1.00 indexes uniform arrays only by loop symbols and constants, so the lane is picked with a mask.
    int lane = i - (i / 4) * 4;
    vec4 mask = vec4(equal(ivec4(lane), ivec4(0, 1, 2, 3)));
    float opacity = dot(uOpacity[i / 4], mask);
    // The fill colour's alpha is a byte, as the canvas stores the parsed rgba().
    float alpha = floor(opacity * 255.0 + 0.5) / 255.0 * coverage;
    vec3 tint = lane == 0 || lane == 2 ? vec3(0.0, 210.0, 255.0) / 255.0 : vec3(255.0, 0.0, 200.0) / 255.0;
    vec4 source = vec4(tint * alpha, alpha);
    colour = source + colour - source * colour;
    colour = floor(colour * 255.0 + 0.5) / 255.0;
  }
  gl_FragColor = colour;
}`;

function bandUniforms(layer: GlitchLayer, context: EffectContext) {
  const bands = glitchBands(layer.glitch, effectLayerSeed(context, layer));
  return { uCount: bands.count, uBands: bands.rects, uOpacity: bands.opacities };
}

/** VHS streaks, the editor's seeded Canvas 2D bands drawn in GLSL from band uniforms computed by the editor's LCG. */
export const glitch = defineEffect<GlitchLayer>({
  id: 'glitch',
  fragment: GLITCH_FRAG,
  fields: ['glitch', 'seedOffset'],
  amount: (layer) => layer.glitch,
  uniforms: bandUniforms,
  centered: false,
  // Seeded, but the same stream and bands as the editor: deterministic at a fixed seed.
  stochastic: false,
});
