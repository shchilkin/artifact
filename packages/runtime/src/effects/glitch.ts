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

/** Bands per group in the shader: a fragment skips whole groups that end above it and stops at one below it. */
const GROUP = 10;

/** One band as the editor draws it, with positions as fractions of the render size. */
export interface GlitchBand {
  /** Left and right edges as fractions of the width. */
  readonly left: number;
  readonly right: number;
  /** Top edge as a fraction of the height. */
  readonly top: number;
  /** Height in reference pixels (`1 + 3u`); the editor multiplies it by `W / 540`. */
  readonly height: number;
  /** The fill colour's alpha. */
  readonly opacity: number;
  /** Odd bands are magenta `rgb(255, 0, 200)`, even bands cyan `rgb(0, 210, 255)`. */
  readonly magenta: boolean;
}

/**
 * The bands the editor draws for a glitch amount and effect seed (`doc.global.seed + seedOffset`), in its drawing
 * order: the same LCG, seeded as `applyEffectLayerCanvas2DEffects` seeds the layer's Canvas 2D stream
 * (`effectSeed ^ 0x1a2b3c`), with the same five draws per band in the same order, `ceil(glitch)` bands as its loop
 * draws, capped at `GLITCH_MAX_BANDS`. Glitch is the first Canvas 2D effect to read that stream when the layer has no
 * light rays, which is the only way a glitch layer runs live (rays are not registered).
 */
export function glitchBands(glitch: number, effectSeed: number): GlitchBand[] {
  const count = glitch > 0 ? Math.min(GLITCH_MAX_BANDS, Math.ceil(glitch)) : 0;
  const rng = glitchLcg(effectSeed ^ 0x1a2b3c);
  const bands: GlitchBand[] = [];
  for (let i = 0; i < count; i += 1) {
    // Editor: y = u·H; h = (1 + 3u)·scale; x = u·W·0.3; w = W·(0.3 + 0.7u); opacity = 0.12 + 0.25u.
    const top = rng();
    const height = 1 + rng() * 3;
    const left = rng() * 0.3;
    const right = left + 0.3 + rng() * 0.7;
    const opacity = 0.12 + rng() * 0.25;
    bands.push({ left, right, top, height, opacity, magenta: i % 2 === 1 });
  }
  return bands;
}

/**
 * The bands as the shader reads them, sorted by top edge: `uBands` holds `left, top, right, height` per band and
 * `uOpacity` the opacity plus 1 for magenta bands, four to a `vec4`. Unused slots sit below the image (top 2), so
 * the shader stops before them. Sorting is exact because the premultiplied screen blend is `1 − (1 − s)(1 − d)`,
 * which does not depend on the order the bands are drawn in, beyond the byte rounding between bands.
 */
export function glitchUniforms(bands: readonly GlitchBand[]): { uBands: number[]; uOpacity: number[] } {
  const uBands = new Array<number>(GLITCH_MAX_BANDS * 4).fill(0);
  const uOpacity = new Array<number>(GLITCH_MAX_BANDS).fill(0);
  const sorted = [...bands].sort((a, b) => a.top - b.top);
  for (let i = 0; i < GLITCH_MAX_BANDS; i += 1) {
    const band = sorted[i];
    if (!band) {
      uBands[i * 4 + 1] = 2;
      continue;
    }
    uBands.splice(i * 4, 4, band.left, band.top, band.right, band.height);
    uOpacity[i] = band.opacity + (band.magenta ? 1 : 0);
  }
  return { uBands, uOpacity };
}

/**
 * VHS streaks (Glitch), ported from the editor's Canvas 2D path (`applyGlitchEffect` in
 * `apps/web/app/utils/render/layers/index.ts`), which the editor keeps. The editor draws `glitch` rectangles with
 * `fillRect` in `screen` blend, alternating `rgba(0, 210, 255, a)` and `rgba(255, 0, 200, a)`; each band's position,
 * height, width and opacity come from five draws of the layer's seeded LCG.
 *
 * Only a hundred bands at most, so the CPU runs the editor's LCG per seed (`glitchBands`) and the shader gets the
 * rectangles as uniforms: the bands land exactly where the editor's do, at any seed. Per fragment the shader takes
 * each band's analytic pixel coverage, as the canvas anti-aliases a fractional rectangle, and composites it with the
 * premultiplied screen blend (`s + d − s·d`, which also covers transparent backdrops), rounding to bytes after each
 * band as the canvas stores them. The bands are sorted by top edge in groups of ten, so a fragment only walks the
 * groups around its row. The render size comes from `inputClamp`.
 *
 * Uniforms: `uBands` (`vec4[100]`), `uOpacity` (`vec4[25]`), from `glitchUniforms`.
 */
export const GLITCH_FRAG = `${HEADER}
// Pixel coordinates and coverage at 1080px need more than mediump's 10-bit mantissa.
precision highp float;
uniform vec4 uBands[${GLITCH_MAX_BANDS}];
uniform vec4 uOpacity[${GLITCH_MAX_BANDS / 4}];

void main() {
  vec2 size = floor(0.5 / inputClamp.xy + 0.5);
  vec2 pixel = floor(vTextureCoord * size);
  vec4 colour = texture2D(uSampler, (pixel + 0.5) / size);
  float scale = size.x / ${REF.toFixed(1)};
  // GLSL ES 1.00 indexes uniform arrays only by loop symbols and constants, hence the nested loops.
  for (int g = 0; g < ${GLITCH_MAX_BANDS / GROUP}; g++) {
    // Sorted by top: a group that starts below this row ends the walk; one whose last band ends above it is skipped.
    if (uBands[g * ${GROUP}].y * size.y >= pixel.y + 1.0) break;
    if (uBands[g * ${GROUP} + ${GROUP - 1}].y * size.y + 4.0 * scale <= pixel.y) continue;
    for (int j = 0; j < ${GROUP}; j++) {
      vec4 band = uBands[g * ${GROUP} + j];
      vec2 lo = vec2(band.x * size.x, band.y * size.y);
      if (lo.y >= pixel.y + 1.0) break;
      vec2 hi = vec2(band.z * size.x, lo.y + band.w * scale);
      vec2 overlap = clamp(min(pixel + 1.0, hi) - max(pixel, lo), 0.0, 1.0);
      float coverage = overlap.x * overlap.y;
      if (coverage <= 0.0) continue;
      int i = g * ${GROUP} + j;
      vec4 lane = vec4(equal(ivec4(i - (i / 4) * 4), ivec4(0, 1, 2, 3)));
      float coded = dot(uOpacity[(g * ${GROUP} + j) / 4], lane);
      float magenta = step(1.0, coded);
      // The fill colour's alpha is a byte, as the canvas stores the parsed rgba().
      float alpha = floor((coded - magenta) * 255.0 + 0.5) / 255.0 * coverage;
      vec3 tint = mix(vec3(0.0, 210.0, 255.0), vec3(255.0, 0.0, 200.0), magenta) / 255.0;
      vec4 source = vec4(tint * alpha, alpha);
      colour = source + colour - source * colour;
      colour = floor(colour * 255.0 + 0.5) / 255.0;
    }
  }
  gl_FragColor = colour;
}`;

function bandUniforms(layer: GlitchLayer, context: EffectContext) {
  return glitchUniforms(glitchBands(layer.glitch, effectLayerSeed(context, layer)));
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
