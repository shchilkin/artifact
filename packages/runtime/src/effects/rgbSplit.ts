import { HEADER, RGB_FRAG } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface RgbSplitLayer {
  readonly rgbSplit: number;
  /**
   * Runtime-only split heading (the editor has no such field): red moves along `(rgbSplitDirX, rgbSplitDirY)` and
   * blue against it. `0, 0` (the default, and every editor layer) is the editor's fixed diagonal. Any other vector is
   * used as a heading only: it is normalised to the diagonal's length, so the split size stays `rgbSplit`.
   */
  readonly rgbSplitDirX?: number;
  readonly rgbSplitDirY?: number;
  readonly seedOffset?: number;
}

/** The editor's diagonal: one unit on each axis, in pixels (Canvas 2D stage) and in texture coordinates (GPU stage). */
const EDITOR_DIAGONAL: readonly [number, number] = [1, 1];

/** The editor's GPU stage passes `uDir = rgbSplit × 0.0006` on both axes (`buildFiltersFromEffectLayer`). */
const GPU_STAGE_SCALE = 0.0006;

/** Per-axis split direction: the editor's diagonal at rest, otherwise the heading scaled to the diagonal's length. */
export function rgbSplitDirection(layer: RgbSplitLayer): readonly [number, number] {
  const x = layer.rgbSplitDirX ?? 0;
  const y = layer.rgbSplitDirY ?? 0;
  const length = Math.hypot(x, y);
  if (!(length > 0)) return EDITOR_DIAGONAL;
  const scale = Math.SQRT2 / length;
  return [x * scale, y * scale];
}

/**
 * The editor's first Chromatic split stage, ported from its CPU path (`applyRgbSplit` in
 * `apps/web/app/utils/render/workers/effectPixelTransform.ts`, run from `applyCanvas2DEffects`), which the editor keeps.
 * The editor rounds the authored amount scaled to the render size to whole pixels (`round(rgbSplit × W / 540)`), then,
 * per pixel `(x, y)` of the unpremultiplied image data, takes red from `(x + o, y + o)` and blue from `(x − o, y − o)`,
 * each axis clamped to the image; green and alpha stay. Nearest pixels, no filtering.
 *
 * The port does the same per fragment with whole-pixel coordinates and texel-centre samples (exact under linear
 * filtering), unpremultiplying before recombining with the pixel's own alpha, as the Radial CA port does. The offset
 * is `round(uRgbSplitDir × o)`, so the default direction `(1, 1)` is the editor's `(o, o)`. The render size comes
 * from `inputClamp`, which the chain insets by half a texel.
 *
 * Uniforms: `uRgbSplit` (the authored amount at 540px), `uRgbSplitDir` (per-axis direction, default `(1, 1)`).
 */
export const RGB_SPLIT_OFFSET_FRAG = `${HEADER}
// Whole-pixel coordinates at 1080px need more than mediump's 10-bit mantissa.
precision highp float;
uniform float uRgbSplit;
uniform vec2 uRgbSplitDir;

vec4 rgbSplitTexel(vec2 pixel, vec2 size) {
  return texture2D(uSampler, (pixel + 0.5) / size);
}

vec3 rgbSplitUnpremultiply(vec4 colour) {
  return colour.a > 0.0 ? colour.rgb / colour.a : vec3(0.0);
}

void main() {
  vec2 size = floor(0.5 / inputClamp.xy + 0.5);
  vec2 pixel = floor(vTextureCoord * size);
  vec4 own = rgbSplitTexel(pixel, size);
  float amount = floor(uRgbSplit * size.x / 540.0 + 0.5);
  if (amount <= 0.0) {
    gl_FragColor = own;
    return;
  }
  vec2 offset = floor(uRgbSplitDir * amount + 0.5);
  vec2 last = size - 1.0;
  float red = rgbSplitUnpremultiply(rgbSplitTexel(clamp(pixel + offset, vec2(0.0), last), size)).r;
  float green = rgbSplitUnpremultiply(own).g;
  float blue = rgbSplitUnpremultiply(rgbSplitTexel(clamp(pixel - offset, vec2(0.0), last), size)).b;
  gl_FragColor = vec4(vec3(red, green, blue) * own.a, own.a);
}`;

/**
 * Chromatic split. The editor applies `rgbSplit` twice within one effect layer: a whole-pixel offset in its Canvas 2D
 * effects, then `RGB_FRAG` among its GPU filters (Canvas 2D effects always run first). The runtime draws both in that
 * order as one pass with two stages: `RGB_SPLIT_OFFSET_FRAG`, then the editor's own `RGB_FRAG`, imported unchanged.
 * Both stages follow the split direction (`rgbSplitDirX/Y`, a runtime-only heading that bindings can drive from
 * `pointer.dirX/dirY`); at rest it is the editor's diagonal, so static output is unchanged.
 */
export const rgbSplit = defineEffect<RgbSplitLayer>({
  id: 'rgbSplit',
  fragment: RGB_SPLIT_OFFSET_FRAG,
  stages: [RGB_FRAG],
  fields: ['rgbSplit', 'rgbSplitDirX', 'rgbSplitDirY'],
  amount: (layer) => layer.rgbSplit,
  uniforms: (layer) => {
    const direction = rgbSplitDirection(layer);
    const magnitude = layer.rgbSplit * GPU_STAGE_SCALE;
    return {
      uRgbSplit: layer.rgbSplit,
      uRgbSplitDir: direction,
      uDir: [magnitude * direction[0], magnitude * direction[1]],
    };
  },
  centered: false,
  stochastic: false,
});
