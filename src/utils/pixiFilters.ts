import { Filter } from 'pixi.js';
import type { GeneratorConfig } from '../types/config';

// All shaders work in normalized [0..1] UV space via inputClamp:
//   norm = (vTextureCoord - inputClamp.xy) / (inputClamp.zw - inputClamp.xy)
// Sampling always clamps to inputClamp to avoid FBO padding artifacts.

// ─── helpers ──────────────────────────────────────────────────

const NORM_UV = `
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;
`;

const SAMPLE = (uv: string) =>
  `texture2D(uSampler, clamp(inputClamp.xy + ${uv} * extent, inputClamp.xy, inputClamp.zw))`;

const HEADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;
`;

// ─── MORPH ─────────────────────────────────────────────────────

const MORPH_FRAG = `${HEADER}
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

// ─── TEAR ──────────────────────────────────────────────────────

const TEAR_FRAG = `${HEADER}
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

// ─── NOISE WARP ────────────────────────────────────────────────

const NOISE_FRAG = `${HEADER}
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
  // Second octave
  ox += (smooth21(norm * 9.0 + seed2 * 2.0) - 0.5) * 0.4;
  oy += (smooth21(norm * 9.0 + seed2 * 2.0 + 50.0) - 0.5) * 0.4;
  vec2 warped = clamp(norm + vec2(ox, oy) * uIntensity, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

// ─── VORTEX ────────────────────────────────────────────────────

const VORTEX_FRAG = `${HEADER}
uniform float uIntensity;

void main() {
  ${NORM_UV}
  vec2  c    = norm - 0.5;
  float dist = length(c);
  float angle = atan(c.y, c.x);
  // Twist falls off with distance — strong at center, zero at edge
  angle += uIntensity * max(0.0, 1.0 - dist * 2.2);
  vec2 warped = clamp(0.5 + dist * vec2(cos(angle), sin(angle)), 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

// ─── BARREL ────────────────────────────────────────────────────

const BARREL_FRAG = `${HEADER}
uniform float uK;

void main() {
  ${NORM_UV}
  vec2  c  = norm - 0.5;
  float r2 = dot(c, c);
  vec2 warped = clamp((c * (1.0 + uK * r2)) + 0.5, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

// ─── PIXELATE ──────────────────────────────────────────────────

const PIXELATE_FRAG = `${HEADER}
uniform float uBlocks;

void main() {
  ${NORM_UV}
  vec2 px      = floor(norm * uBlocks) / uBlocks + 0.5 / uBlocks;
  vec2 warped  = clamp(px, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

// ─── HUE ROTATE ────────────────────────────────────────────────

const HUE_FRAG = `${HEADER}
uniform float uAngle;

void main() {
  vec4 col  = texture2D(uSampler, vTextureCoord);
  float cosA = cos(uAngle);
  float sinA = sin(uAngle);
  float k    = 1.0 / 3.0;
  float s    = 0.57735; // 1/sqrt(3)
  mat3 m = mat3(
    cosA + (1.0-cosA)*k,      (1.0-cosA)*k - sinA*s, (1.0-cosA)*k + sinA*s,
    (1.0-cosA)*k + sinA*s,    cosA + (1.0-cosA)*k,   (1.0-cosA)*k - sinA*s,
    (1.0-cosA)*k - sinA*s,    (1.0-cosA)*k + sinA*s, cosA + (1.0-cosA)*k
  );
  col.rgb = clamp(m * col.rgb, 0.0, 1.0);
  gl_FragColor = col;
}`;

// ─── RGB SPLIT (diagonal) ──────────────────────────────────────

const RGB_FRAG = `${HEADER}
uniform vec2 uDir;

void main() {
  vec2 uv  = vTextureCoord;
  float r  = texture2D(uSampler, clamp(uv + uDir,         inputClamp.xy, inputClamp.zw)).r;
  float g  = texture2D(uSampler, uv).g;
  float b  = texture2D(uSampler, clamp(uv - uDir,         inputClamp.xy, inputClamp.zw)).b;
  float a  = texture2D(uSampler, uv).a;
  gl_FragColor = vec4(r, g, b, a);
}`;

// ─── VIGNETTE ──────────────────────────────────────────────────

const VIGNETTE_FRAG = `${HEADER}
uniform float uIntensity;

void main() {
  vec4  col  = texture2D(uSampler, vTextureCoord);
  ${NORM_UV}
  vec2  c    = norm - 0.5;
  float dist = length(c) * 1.6;
  float vig  = 1.0 - uIntensity * (dist * dist);
  col.rgb   *= clamp(vig, 0.0, 1.0);
  gl_FragColor = col;
}`;

// ─── FACTORY ───────────────────────────────────────────────────

function f(frag: string, uniforms: Record<string, unknown>): Filter {
  const filter = new Filter(undefined, frag, uniforms);
  filter.padding = 0;
  return filter;
}

export function buildFilters(cfg: GeneratorConfig, seed: number): Filter[] | null {
  const filters: Filter[] = [];

  if (cfg.noiseWarp > 0)
    filters.push(f(NOISE_FRAG, { uIntensity: cfg.noiseWarp * 0.0008, uSeed: seed }));

  if (cfg.morphAmt > 0)
    filters.push(f(MORPH_FRAG, { uIntensity: cfg.morphAmt * 0.05, uFreq: cfg.morphFreq, uSeed: seed }));

  if (cfg.vortex > 0)
    filters.push(f(VORTEX_FRAG, { uIntensity: cfg.vortex * 0.03 }));

  if (cfg.barrel > 0)
    filters.push(f(BARREL_FRAG, { uK: cfg.barrel * 0.04 }));

  if (cfg.tearAmt > 0)
    filters.push(f(TEAR_FRAG, { uIntensity: cfg.tearAmt * 0.007, uChunkH: cfg.tearSize / 1000, uSeed: seed }));

  if (cfg.pixelate > 0)
    filters.push(f(PIXELATE_FRAG, { uBlocks: Math.max(2, Math.round(540 / cfg.pixelate)) }));

  if (cfg.rgbSplit > 0) {
    // 45° diagonal direction in texCoord units
    const mag = cfg.rgbSplit * 0.0006;
    filters.push(f(RGB_FRAG, { uDir: [mag, mag] }));
  }

  if (cfg.hueShift > 0)
    filters.push(f(HUE_FRAG, { uAngle: (cfg.hueShift * Math.PI) / 180 }));

  if (cfg.vignette > 0)
    filters.push(f(VIGNETTE_FRAG, { uIntensity: cfg.vignette * 0.01 }));

  return filters.length > 0 ? filters : null;
}
