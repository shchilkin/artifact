/**
 * Effect fragment shaders shared by the editor's Pixi filters (`apps/web/app/utils/pixiFilters.ts`) and the
 * experimental real-time runtime (`@artifact/runtime`). The strings are GLSL ES 1.00 Pixi filter fragments: they
 * read `vTextureCoord`, `uSampler` and `inputClamp` only, so any host that provides those inputs runs them unchanged.
 *
 * Plain strings only: no Pixi, DOM or WebGL imports.
 */

/** Maps `vTextureCoord` to `norm` (0..1 across the filter input) and declares `extent` for `SAMPLE`. */
export const NORM_UV = `
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;
`;

/** Samples the filter input at a normalised coordinate expression, clamped to the input frame. */
export const SAMPLE = (uv: string) =>
  `texture2D(uSampler, clamp(inputClamp.xy + ${uv} * extent, inputClamp.xy, inputClamp.zw))`;

/** The inputs every Pixi filter fragment declares. */
export const HEADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;
`;

/** Noise Warp: two octaves of value noise displace the sample coordinate. Uniforms: `uIntensity`, `uSeed`. */
export const NOISE_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uSeed;

float h21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float smooth21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1,0)), f.x),
    mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x),
    f.y
  );
}

void main() {
  ${NORM_UV}
  vec2 seed2 = vec2(uSeed * 0.001, uSeed * 0.0007);
  float ox = smooth21(norm * 4.0 + seed2)         - 0.5;
  float oy = smooth21(norm * 4.0 + seed2 + 100.0) - 0.5;
  ox += (smooth21(norm * 9.0 + seed2 * 2.0) - 0.5) * 0.4;
  oy += (smooth21(norm * 9.0 + seed2 * 2.0 + 50.0) - 0.5) * 0.4;
  vec2 warped = clamp(norm + vec2(ox, oy) * uIntensity, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;
