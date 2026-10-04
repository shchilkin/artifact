import { HEADER } from '@artifact/shared/effect-shaders';
import { defineEffect } from '../registry.js';

export interface ScanlinesLayer {
  readonly scanlines: number;
  readonly scanlineWidth?: number;
  readonly seedOffset?: number;
}

/**
 * Scanlines, ported from the editor's Canvas 2D path (`applyScanlines` in
 * `apps/web/app/utils/render/layers/textureEffects.ts`), which the editor keeps. With `scale = W / 540` (the output
 * width over the editor's reference size), the editor fills black rows at `rgba(0, 0, 0, scanlines / 100)` with
 * `source-over`:
 *
 * - each line is `max(1, round(scanlineWidth × scale))` pixels tall;
 * - the gap below it is `max(1, round(scale))` pixels;
 * - the first line starts at the top row, so lines repeat every `line + gap` pixels from `y = 0`.
 *
 * The port computes the same line and gap in output pixels (`uOutputSize`, set by the chain) and covers each pixel
 * row by the share of it the lines overlap. At rest every row lies wholly in a line or in a gap, so the rows are the
 * editor's. `uOffset` moves the lines down in line periods (line + gap). The default 0 keeps the editor's still, and
 * whole periods give the same frame, so a crawl that moves whole periods per loop closes. Fractional offsets cover
 * the rows a line straddles in part, which reads as smooth motion rather than 1 px jumps.
 *
 * Browsers round the fill differently. Both quantise the alpha to a byte `a`. Chromium and Firefox (Skia) then
 * truncate `c × (256 − a − a / 128) / 256`; WebKit (Core Graphics on macOS, Cairo on Linux) rounds
 * `c × (255 − a) / 255`. The two disagree by one level on many line pixels (0.37 levels of mean difference on the graphic fixture), more than the parity
 * tolerance allows for a mean difference. The port computes both byte for byte and alternates them in a pixel
 * checkerboard, so it is at most one level from either editor and splits the mean difference between them.
 *
 * Uniforms: `uAlpha` (`scanlines / 100`), `uLineWidth` (`scanlineWidth`, authored pixels at 540px), `uOffset`.
 */
export const SCANLINES_FRAG = `${HEADER}
// Row coverage over a whole frame and byte rounding need more than mediump's 10-bit mantissa.
precision highp float;
uniform vec2 uOutputSize;
uniform float uAlpha;
uniform float uLineWidth;
uniform float uOffset;

// Rows from 0 to y that lie in a line, for lines of height lineH every period rows from row 0.
float lineRows(float y, float lineH, float period) {
  float turns = floor(y / period);
  return turns * lineH + min(y - turns * period, lineH);
}

void main() {
  vec4 backdrop = texture2D(uSampler, vTextureCoord);
  // JavaScript's Math.round is floor(x + 0.5) for these positive values.
  float scale = uOutputSize.x / 540.0;
  float lineH = max(1.0, floor(uLineWidth * scale + 0.5));
  float gap = max(1.0, floor(scale + 0.5));
  float period = lineH + gap;

  // This pixel's rows from the top, shifted back by the offset and wrapped into one period.
  float top = vTextureCoord.y * uOutputSize.y - 0.5 - fract(uOffset) * period;
  top -= floor(top / period) * period;
  float coverage = clamp(lineRows(top + 1.0, lineH, period) - lineRows(top, lineH, period), 0.0, 1.0);

  // Black at the byte alpha, source-over the premultiplied backdrop, rounded as Skia or as WebKit (see above).
  float a8 = floor(clamp(uAlpha, 0.0, 1.0) * coverage * 255.0 + 0.5);
  vec4 b8 = floor(backdrop * 255.0 + 0.5);
  vec4 skia = floor(b8 * (256.0 - a8 - floor(a8 / 128.0)) / 256.0);
  vec4 webkit = floor(b8 * (255.0 - a8) / 255.0 + 0.5);
  vec2 cell = floor(gl_FragCoord.xy);
  vec4 under = mod(cell.x + cell.y, 2.0) < 0.5 ? skia : webkit;
  gl_FragColor = vec4(under.rgb, min(255.0, a8 + under.a)) / 255.0;
}`;

/** Scanlines, a GLSL port of the editor's Canvas 2D scanlines with a bindable vertical offset. */
export const scanlines = defineEffect<ScanlinesLayer>({
  id: 'scanlines',
  fragment: SCANLINES_FRAG,
  fields: ['scanlines', 'scanlineWidth'],
  amount: (layer) => layer.scanlines,
  uniforms: (layer) => ({
    uAlpha: layer.scanlines / 100,
    uLineWidth: layer.scanlineWidth ?? 1,
    uOffset: 0,
  }),
  centered: false,
  stochastic: false,
});
