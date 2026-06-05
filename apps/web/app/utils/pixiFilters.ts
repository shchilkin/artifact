import { BlurFilter, Filter } from 'pixi.js';
import type { EffectLayer } from '../types/config';

const NORM_UV = `
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;
`;

const SAMPLE = (uv: string) =>
  `texture2D(uSampler, clamp(inputClamp.xy + ${uv} * extent, inputClamp.xy, inputClamp.zw))`;

function hexToVec3(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

const HEADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;
`;

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
  ox += (smooth21(norm * 9.0 + seed2 * 2.0) - 0.5) * 0.4;
  oy += (smooth21(norm * 9.0 + seed2 * 2.0 + 50.0) - 0.5) * 0.4;
  vec2 warped = clamp(norm + vec2(ox, oy) * uIntensity, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const VORTEX_FRAG = `${HEADER}
uniform float uIntensity;

void main() {
  ${NORM_UV}
  vec2  c    = norm - 0.5;
  float dist = length(c);
  float angle = atan(c.y, c.x);
  angle += uIntensity * max(0.0, 1.0 - dist * 2.2);
  vec2 warped = clamp(0.5 + dist * vec2(cos(angle), sin(angle)), 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const BARREL_FRAG = `${HEADER}
uniform float uK;

void main() {
  ${NORM_UV}
  vec2  c  = norm - 0.5;
  float r2 = dot(c, c);
  vec2 warped = clamp((c * (1.0 + uK * r2)) + 0.5, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const PIXELATE_FRAG = `${HEADER}
uniform float uBlocks;

void main() {
  ${NORM_UV}
  vec2 px      = floor(norm * uBlocks) / uBlocks + 0.5 / uBlocks;
  vec2 warped  = clamp(px, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const HUE_FRAG = `${HEADER}
uniform float uAngle;

void main() {
  vec4 col  = texture2D(uSampler, vTextureCoord);
  float cosA = cos(uAngle);
  float sinA = sin(uAngle);
  float k    = 1.0 / 3.0;
  float s    = 0.57735;
  mat3 m = mat3(
    cosA + (1.0-cosA)*k,      (1.0-cosA)*k - sinA*s, (1.0-cosA)*k + sinA*s,
    (1.0-cosA)*k + sinA*s,    cosA + (1.0-cosA)*k,   (1.0-cosA)*k - sinA*s,
    (1.0-cosA)*k - sinA*s,    (1.0-cosA)*k + sinA*s, cosA + (1.0-cosA)*k
  );
  col.rgb = clamp(m * col.rgb, 0.0, 1.0);
  gl_FragColor = col;
}`;

const RGB_FRAG = `${HEADER}
uniform vec2 uDir;

void main() {
  vec2 uv  = vTextureCoord;
  float r  = texture2D(uSampler, clamp(uv + uDir, inputClamp.xy, inputClamp.zw)).r;
  float g  = texture2D(uSampler, uv).g;
  float b  = texture2D(uSampler, clamp(uv - uDir, inputClamp.xy, inputClamp.zw)).b;
  float a  = texture2D(uSampler, uv).a;
  gl_FragColor = vec4(r, g, b, a);
}`;

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

const MIRROR_FRAG = `${HEADER}
uniform float uMode;

void main() {
  ${NORM_UV}
  vec2 m = norm;
  if (uMode >= 0.5) m.x = 1.0 - abs(m.x * 2.0 - 1.0);
  if (uMode >= 1.5) m.y = 1.0 - abs(m.y * 2.0 - 1.0);
  gl_FragColor = ${SAMPLE('m')};
}`;

const DATAMOSH_FRAG = `${HEADER}
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

const INTERLACE_FRAG = `${HEADER}
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

const BLOOM_FRAG = `${HEADER}
uniform float uIntensity;

void main() {
  ${NORM_UV}
  vec4 base = ${SAMPLE('norm')};
  vec3 glow = vec3(0.0);
  float r   = uIntensity * 0.022;

  for (int i = 0; i < 8; i++) {
    float a   = float(i) * 0.7854;
    vec2  off = vec2(cos(a), sin(a)) * r;
    vec4  s   = ${SAMPLE('norm + off')};
    float bright = max(0.0, dot(s.rgb, vec3(0.299, 0.587, 0.114)) - 0.55);
    glow += s.rgb * bright;
  }

  glow /= 8.0;
  gl_FragColor = vec4(min(vec3(1.0), base.rgb + glow * uIntensity * 0.6), base.a);
}`;

const POSTERIZE_FRAG = `${HEADER}
uniform float uSteps;

void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  vec3 p   = floor(col.rgb * uSteps + 0.5) / uSteps;
  gl_FragColor = vec4(p, col.a);
}`;

const FILMBURN_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uSeed;

void main() {
  ${NORM_UV}
  float ci = mod(floor(uSeed * 0.004 + 0.5), 4.0);
  vec2 corner;
  if      (ci < 0.5) corner = vec2(0.0, 0.0);
  else if (ci < 1.5) corner = vec2(1.0, 0.0);
  else if (ci < 2.5) corner = vec2(1.0, 1.0);
  else               corner = vec2(0.0, 1.0);
  vec4  col  = ${SAMPLE('norm')};
  float dist = length(norm - corner);
  float burn = pow(max(0.0, 1.0 - dist / 0.28), 3.0) * uIntensity;
  vec3 fireColor = mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.95, 0.75), burn);
  gl_FragColor = vec4(min(vec3(1.0), col.rgb + fireColor * burn), col.a);
}`;

const DUOTONE_FRAG = `${HEADER}
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uStrength;

void main() {
  vec4  col  = texture2D(uSampler, vTextureCoord);
  float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  vec3  duo  = mix(uColorA, uColorB, luma);
  gl_FragColor = vec4(mix(col.rgb, duo, uStrength), col.a);
}`;

const HALFTONE_FRAG = `${HEADER}
uniform float uGrid;
uniform float uStrength;
uniform vec2  uResolution;

void main() {
  ${NORM_UV}
  vec4 original  = ${SAMPLE('norm')};
  float cellSize = max(uResolution.x, uResolution.y) / uGrid;
  vec2 pixel     = norm * uResolution;
  vec2 cell      = floor(pixel / cellSize);
  vec2 cellCentrePx = (cell + 0.5) * cellSize;
  vec2 cellCentre= clamp(cellCentrePx / uResolution, 0.0, 1.0);
  vec4 cellCol   = ${SAMPLE('cellCentre')};
  float luma     = dot(cellCol.rgb, vec3(0.299, 0.587, 0.114));
  vec2  delta = (pixel - cellCentrePx) / cellSize;
  float dist  = length(delta);
  float radius= sqrt(luma) * 0.72;
  float inDot = step(dist, radius);
  vec3 dotted = cellCol.rgb * inDot;
  gl_FragColor = vec4(mix(original.rgb, dotted, uStrength), original.a);
}`;

const THRESHOLD_FRAG = `${HEADER}
uniform float uCut;

void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(vec3(step(uCut, luma)), col.a);
}`;

const EDGE_FRAG = `${HEADER}
uniform float uIntensity;
uniform vec2  uPx;

vec3 sEdge(vec2 uv) {
  return texture2D(uSampler, clamp(uv, inputClamp.xy, inputClamp.zw)).rgb;
}

void main() {
  vec2 uv = vTextureCoord;
  vec3 tl = sEdge(uv + vec2(-uPx.x, -uPx.y));
  vec3 tm = sEdge(uv + vec2( 0.0,   -uPx.y));
  vec3 tr = sEdge(uv + vec2( uPx.x, -uPx.y));
  vec3 ml = sEdge(uv + vec2(-uPx.x,  0.0  ));
  vec3 mr = sEdge(uv + vec2( uPx.x,  0.0  ));
  vec3 bl = sEdge(uv + vec2(-uPx.x,  uPx.y));
  vec3 bm = sEdge(uv + vec2( 0.0,    uPx.y));
  vec3 br = sEdge(uv + vec2( uPx.x,  uPx.y));
  vec3 gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
  vec3 gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;
  float e = clamp(length(gx + gy) * 0.5, 0.0, 1.0);
  vec4 base = texture2D(uSampler, uv);
  gl_FragColor = vec4(mix(base.rgb, vec3(e), uIntensity), base.a);
}`;

const GRADIENT_FRAG = `${HEADER}
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uAngle;
uniform float uMix;

void main() {
  ${NORM_UV}
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  float t  = clamp(dot(norm - 0.5, dir) + 0.5, 0.0, 1.0);
  vec3 grad = mix(uColorA, uColorB, t);
  vec4 col  = ${SAMPLE('norm')};
  gl_FragColor = vec4(mix(col.rgb, grad, uMix), col.a);
}`;

const RISO_FRAG = `${HEADER}
uniform float uMag;
uniform float uAngle;

void main() {
  ${NORM_UV}
  vec2 dir     = vec2(cos(uAngle), sin(uAngle)) * uMag;
  vec4 base    = ${SAMPLE('norm')};
  vec4 shifted = ${SAMPLE('norm + dir')};
  float luma   = dot(shifted.rgb, vec3(0.299, 0.587, 0.114));
  vec3 result  = min(vec3(1.0), base.rgb + shifted.rgb * luma * 0.55);
  gl_FragColor = vec4(result, base.a);
}`;

function f(frag: string, uniforms: Record<string, unknown>): Filter {
  const filter = new Filter(undefined, frag, uniforms);
  filter.padding = 0;
  return filter;
}

type FilterConfig = Pick<EffectLayer, keyof Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked' | 'kind'>>;

function buildFilters(cfg: FilterConfig, seed: number, refSize = 540, canvasH = 540): Filter[] | null {
  const filters: Filter[] = [];

  if (cfg.mirror > 0) filters.push(f(MIRROR_FRAG, { uMode: Math.round(cfg.mirror) }));
  if (cfg.dataMosh > 0) filters.push(f(DATAMOSH_FRAG, { uIntensity: cfg.dataMosh * 0.007, uSeed: seed }));
  if (cfg.interlace > 0)
    filters.push(f(INTERLACE_FRAG, { uIntensity: cfg.interlace * 0.003, uSeed: seed, uResY: canvasH }));
  if (cfg.noiseWarp > 0) filters.push(f(NOISE_FRAG, { uIntensity: cfg.noiseWarp * 0.0008, uSeed: seed }));
  if (cfg.morphAmt > 0)
    filters.push(f(MORPH_FRAG, { uIntensity: cfg.morphAmt * 0.05, uFreq: cfg.morphFreq, uSeed: seed }));
  if (cfg.vortex > 0) filters.push(f(VORTEX_FRAG, { uIntensity: cfg.vortex * 0.03 }));
  if (cfg.barrel > 0) filters.push(f(BARREL_FRAG, { uK: cfg.barrel * 0.04 }));
  if (cfg.tearAmt > 0)
    filters.push(f(TEAR_FRAG, { uIntensity: cfg.tearAmt * 0.007, uChunkH: cfg.tearSize / 1000, uSeed: seed }));

  if (cfg.pixelate > 0) filters.push(f(PIXELATE_FRAG, { uBlocks: Math.max(2, Math.round(refSize / cfg.pixelate)) }));
  if (cfg.posterize > 0) filters.push(f(POSTERIZE_FRAG, { uSteps: Math.max(2, cfg.posterize) }));
  if (cfg.hueShift > 0) filters.push(f(HUE_FRAG, { uAngle: (cfg.hueShift * Math.PI) / 180 }));
  if (cfg.rgbSplit > 0) {
    const mag = cfg.rgbSplit * 0.0006;
    filters.push(f(RGB_FRAG, { uDir: [mag, mag] }));
  }

  if (cfg.duotone > 0) {
    filters.push(
      f(DUOTONE_FRAG, {
        uColorA: hexToVec3(cfg.duoA),
        uColorB: hexToVec3(cfg.duoB),
        uStrength: cfg.duotone / 100,
      }),
    );
  }

  if (cfg.halftone > 0)
    filters.push(f(HALFTONE_FRAG, { uGrid: cfg.halftone * 3 + 4, uStrength: 0.85, uResolution: [refSize, canvasH] }));
  if (cfg.risoShift > 0)
    filters.push(f(RISO_FRAG, { uMag: cfg.risoShift * 0.0012, uAngle: (cfg.risoAngle * Math.PI) / 180 }));
  if (cfg.bloom > 0) filters.push(f(BLOOM_FRAG, { uIntensity: cfg.bloom / 100 }));
  if (cfg.blurAmt > 0) {
    const blur = new BlurFilter(cfg.blurAmt * 0.5, 4);
    blur.padding = Math.ceil(cfg.blurAmt * 0.5) + 4;
    filters.push(blur);
  }
  if (cfg.threshold > 0) filters.push(f(THRESHOLD_FRAG, { uCut: cfg.threshold / 100 }));
  if (cfg.edgeDetect > 0) {
    filters.push(
      f(EDGE_FRAG, {
        uIntensity: cfg.edgeDetect / 100,
        uPx: [1 / refSize, 1 / canvasH],
      }),
    );
  }
  if (cfg.gradMix > 0) {
    filters.push(
      f(GRADIENT_FRAG, {
        uColorA: hexToVec3(cfg.gradA),
        uColorB: hexToVec3(cfg.gradB),
        uAngle: (cfg.gradAngle * Math.PI) / 180,
        uMix: cfg.gradMix / 100,
      }),
    );
  }
  if (cfg.vignette > 0) filters.push(f(VIGNETTE_FRAG, { uIntensity: cfg.vignette * 0.01 }));
  if (cfg.filmBurn > 0) filters.push(f(FILMBURN_FRAG, { uIntensity: cfg.filmBurn / 100, uSeed: seed }));

  return filters.length > 0 ? filters : null;
}

export const buildFiltersFromEffectLayer = buildFilters;
