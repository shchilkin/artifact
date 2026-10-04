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
 * Liquid Morph: displaces the sample coordinate along crossed sine/cosine waves of frequency `uFreq`, phased by
 * `uSeed * 0.00123`, so a slowly drifting seed makes the surface flow. Uniforms: `uIntensity`, `uFreq`, `uSeed`.
 */
export const MORPH_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uFreq;
uniform float uSeed;

void main() {
  ${NORM_UV}
  float t  = uSeed * 0.00123;
  float f  = uFreq;
  float wx = sin(norm.y * f + t * 3.1) * cos(norm.x * f * 0.7 + t * 1.7);
  float wy = cos(norm.x * f + t * 2.3) * sin(norm.y * f * 0.8 + t * 0.8);
  vec2 warped = clamp(norm + vec2(wx, wy) * uIntensity, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

/**
 * Data Mosh: splits the frame into blocks 0.06 wide; a seeded hash picks about 45% of them and shifts each by its own
 * offset (wrapped with `fract`). The seed only chooses which blocks move, so re-seeding re-moshes the frame.
 * Uniforms: `uIntensity`, `uSeed`.
 */
export const DATAMOSH_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uSeed;

float dmHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  ${NORM_UV}
  float blockSize = 0.06;
  vec2 blockId = floor(norm / blockSize);
  float active = step(0.55, dmHash(blockId + uSeed * 0.001));
  vec2 offset  = (vec2(dmHash(blockId), dmHash(blockId + 1.3)) - 0.5)
                 * uIntensity * active;
  vec2 warped  = fract(norm + offset);
  gl_FragColor = ${SAMPLE('warped')};
}`;

/**
 * Interlace: shifts every row of the frame sideways, wrapping around, by a hashed fraction of `uIntensity`; odd rows
 * move right and even rows left. Rows are counted at the render height `uResY`, and the hash is seeded by `uSeed`, so a
 * new seed shifts every row by a different amount. Uniforms: `uIntensity`, `uSeed`, `uResY`.
 */
export const INTERLACE_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uSeed;
uniform float uResY;

float ilHash(float n) {
  return fract(sin(n * 127.1 + uSeed * 0.007) * 43758.5453);
}

void main() {
  ${NORM_UV}
  float row   = floor(norm.y * uResY);
  float even  = mod(row, 2.0);
  float shift = (even * 2.0 - 1.0) * uIntensity * ilHash(row);
  vec2 warped = vec2(fract(norm.x + shift), norm.y);
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

/**
 * Chromatic split (`rgbSplit`): red sampled at `+uDir`, blue at `-uDir`, green and alpha in place, both offsets
 * clamped to the input frame. Uniforms: `uDir` (an offset in texture coordinates; the editor passes
 * `rgbSplit × 0.0006` on both axes).
 */
export const RGB_FRAG = `${HEADER}
uniform vec2 uDir;

void main() {
  vec2 uv  = vTextureCoord;
  float r  = texture2D(uSampler, clamp(uv + uDir, inputClamp.xy, inputClamp.zw)).r;
  float g  = texture2D(uSampler, uv).g;
  float b  = texture2D(uSampler, clamp(uv - uDir, inputClamp.xy, inputClamp.zw)).b;
  float a  = texture2D(uSampler, uv).a;
  gl_FragColor = vec4(r, g, b, a);
}`;

/**
 * The Pixelate cell lookup for a block count expression (`blocks` blocks across each axis of the input): snaps `norm`
 * to the centre of its block and samples there. `PIXELATE_FRAG` calls it with `uBlocks`; the runtime's reveal mask
 * calls it with a per-pixel block count, so both share the sampling code.
 */
export const PIXELATE_SAMPLE = (
  blocks: string,
) => `vec2 px      = floor(norm * ${blocks}) / ${blocks} + 0.5 / ${blocks};
  vec2 warped  = clamp(px, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};`;

/**
 * Pixelate: samples each of `uBlocks × uBlocks` blocks at its centre. Uniforms: `uBlocks` (the editor passes
 * `max(2, round(width / pixelate))`, so `pixelate` is the block size in pixels).
 */
export const PIXELATE_FRAG = `${HEADER}
uniform float uBlocks;

void main() {
  ${NORM_UV}
  ${PIXELATE_SAMPLE('uBlocks')}
}`;

/**
 * Vignette: darkens RGB by `uIntensity × (1.6 × distance from uCenter)²`, clamped to [0, 1], so the light spot sits
 * at `uCenter`. Alpha is unchanged. Uniforms: `uIntensity`, `uCenter` (the editor passes `0.5, 0.5`).
 */
export const VIGNETTE_FRAG = `${HEADER}
uniform float uIntensity;
uniform vec2 uCenter;

void main() {
  vec4  col  = texture2D(uSampler, vTextureCoord);
  ${NORM_UV}
  vec2  c    = norm - uCenter;
  float dist = length(c) * 1.6;
  float vig  = 1.0 - uIntensity * (dist * dist);
  col.rgb   *= clamp(vig, 0.0, 1.0);
  gl_FragColor = col;
}`;
