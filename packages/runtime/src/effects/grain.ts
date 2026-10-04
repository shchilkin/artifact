import { HEADER } from '@artifact/shared/effect-shaders';
import { defineEffect, effectLayerSeed } from '../registry.js';

export interface GrainLayer {
  readonly grain: number;
  readonly seedOffset?: number;
}

/**
 * Grain, ported from the editor's CPU path (`applyGrain` in `apps/web/app/utils/render/layers/textureEffects.ts`),
 * which the editor keeps. The editor fills a grain texture through `putImageData`, one LCG draw `u` per pixel:
 *
 * - `n = (u - 0.5) × grain × 3` levels, the same draw for R, G and B (monochrome grain);
 * - colour `128 + n` and alpha `min(255, |n| × 2)`, both rounded and clamped to bytes;
 * - stored premultiplied by the 2D canvas, so the colour is rounded again as `colour × alpha / 255`;
 *
 * then draws it over the layer with `overlay` at `globalAlpha` 0.45, one texel per output pixel (no `REF` scaling).
 *
 * The port keeps every step of that per-pixel distribution and replaces the LCG with a per-pixel hash of the pixel
 * and the seed, so the noise differs pixel by pixel but not in distribution. A new seed (for example a step track on
 * `seedOffset`) draws a new field, as a new LCG seed does. The overlay is the canvas's premultiplied form, which also
 * covers transparent backdrops.
 *
 * Uniforms: `uGrain` (the authored amount), `uSeed` (`doc.global.seed + seedOffset`).
 */
export const GRAIN_FRAG = `${HEADER}
// Byte rounding and the hash need more than mediump's 10-bit mantissa.
precision highp float;
uniform float uGrain;
uniform float uSeed;

// Hash without sine (Dave Hoskins): a uniform draw in [0, 1) per pixel and seed.
float grainHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec4 backdrop = texture2D(uSampler, vTextureCoord);
  // Seeds stay small enough for float precision; whole seeds give unrelated fields.
  float seed = mod(uSeed, 4096.0);
  vec2 pixel = floor(gl_FragCoord.xy);
  float u = grainHash(vec3(pixel, seed + 0.37));
  u = grainHash(vec3(pixel.yx + u * 1024.0, seed * 1.618 + 11.0));

  float n = (u - 0.5) * uGrain * 3.0;
  float colour8 = clamp(floor(128.0 + n + 0.5), 0.0, 255.0);
  float alpha8 = clamp(floor(abs(n) * 2.0 + 0.5), 0.0, 255.0);
  float premultiplied8 = floor(colour8 * alpha8 / 255.0 + 0.5);

  // Source over the backdrop with overlay at globalAlpha 0.45, premultiplied.
  float sa = alpha8 / 255.0 * 0.45;
  vec3 sc = vec3(premultiplied8 / 255.0 * 0.45);
  float da = backdrop.a;
  vec3 dc = backdrop.rgb;
  vec3 low = 2.0 * sc * dc;
  vec3 high = sa * da - 2.0 * (da - dc) * (sa - sc);
  vec3 blended = mix(high, low, step(2.0 * dc, vec3(da)));
  vec3 colour = sc * (1.0 - da) + dc * (1.0 - sa) + blended;
  gl_FragColor = vec4(colour, sa + da - sa * da);
}`;

/** Grain, a GLSL port of the editor's CPU grain with a GPU hash in place of its LCG. */
export const grain = defineEffect<GrainLayer>({
  id: 'grain',
  fragment: GRAIN_FRAG,
  fields: ['grain', 'seedOffset'],
  amount: (layer) => layer.grain,
  uniforms: (layer, context) => ({
    uGrain: layer.grain,
    uSeed: effectLayerSeed(context, layer),
  }),
  centered: false,
  stochastic: true,
});
