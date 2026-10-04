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

/**
 * Vortex: rotates the sample coordinate around `uCenter`, strongest at the centre and fading out by a radius of
 * 1 / 2.2. Uniforms: `uIntensity`, `uCenter` (the editor passes `0.5, 0.5`).
 */
export const VORTEX_FRAG = `${HEADER}
uniform float uIntensity;
uniform vec2 uCenter;

void main() {
  ${NORM_UV}
  vec2  c    = norm - uCenter;
  float dist = length(c);
  float angle = atan(c.y, c.x);
  angle += uIntensity * max(0.0, 1.0 - dist * 2.2);
  vec2 warped = clamp(uCenter + dist * vec2(cos(angle), sin(angle)), 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

/**
 * Chunk Tear: splits the frame into horizontal bands `uChunkH` tall (normalised) and shifts about 30% of them
 * sideways, wrapping around, by up to `uIntensity` of the width. Which bands move, and how far, is a hash of the band
 * index and `uSeed`, so a new seed tears different bands. Uniforms: `uIntensity`, `uChunkH`, `uSeed`.
 */
export const TEAR_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uChunkH;
uniform float uSeed;

float hash(float n) {
  return fract(sin(n * 127.1 + uSeed * 0.01) * 43758.5453);
}

void main() {
  ${NORM_UV}
  float chunkId    = floor(norm.y / uChunkH);
  float active     = step(0.7, hash(chunkId));
  float offsetNorm = (hash(chunkId + 57.3) - 0.5) * 2.0 * uIntensity * active;
  vec2 warped      = vec2(fract(norm.x + offsetNorm), norm.y);
  gl_FragColor     = ${SAMPLE('warped')};
}`;
