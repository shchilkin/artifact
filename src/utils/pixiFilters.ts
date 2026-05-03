import { Filter } from 'pixi.js';

// vTextureCoord is in filter-FBO texture space (0..W/texW, 0..H/texH).
// inputClamp.xy / .zw = min/max valid UV in that space — clamp to these to
// avoid sampling the FBO padding area (which is transparent = black).
// uPixelStep converts a 0..1 normalized displacement to texCoord units.

const MORPH_FRAG = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;
uniform vec4 inputSize;
uniform vec4 outputFrame;

uniform float uIntensity;
uniform float uSeed;

void main() {
  // Normalized [0..1] position inside the sprite, for driving the warp shape
  vec2 norm = (vTextureCoord - inputClamp.xy)
            / (inputClamp.zw - inputClamp.xy);

  float t = uSeed * 0.00123;
  float warpX = sin(norm.y * 12.0 + t * 3.1) * cos(norm.x * 8.0 + t * 1.7);
  float warpY = cos(norm.x * 10.0 + t * 2.3) * sin(norm.y * 9.0 + t * 0.8);

  // Scale to texCoord units: uIntensity is in [0..1] norm space,
  // multiply by the texCoord extent of the sprite to get texCoord offset.
  vec2 extent  = inputClamp.zw - inputClamp.xy;
  vec2 offset  = vec2(warpX, warpY) * uIntensity * extent;
  vec2 sampleUV = clamp(vTextureCoord + offset, inputClamp.xy, inputClamp.zw);

  gl_FragColor = texture2D(uSampler, sampleUV);
}
`;

const TEAR_FRAG = `
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;

uniform float uIntensity;
uniform float uSeed;

float hash(float n) {
  return fract(sin(n * 127.1 + uSeed * 0.01) * 43758.5453);
}

void main() {
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;

  float chunkId = floor(norm.y / 0.03);
  float active  = step(0.7, hash(chunkId));
  float offsetNorm = (hash(chunkId + 57.3) - 0.5) * 2.0 * uIntensity * active;

  // Wrap horizontally in norm space, then convert back to texCoord
  float wrappedX = fract(norm.x + offsetNorm);
  vec2 sampleUV  = clamp(
    inputClamp.xy + vec2(wrappedX, norm.y) * extent,
    inputClamp.xy, inputClamp.zw
  );

  gl_FragColor = texture2D(uSampler, sampleUV);
}
`;

export function createMorphFilter(morphAmt: number, seed: number): Filter {
  const f = new Filter(undefined, MORPH_FRAG, {
    uIntensity: morphAmt * 0.05,
    uSeed: seed,
  });
  f.padding = 0;
  return f;
}

export function createTearFilter(tearAmt: number, seed: number): Filter {
  const f = new Filter(undefined, TEAR_FRAG, {
    uIntensity: tearAmt * 0.007,
    uSeed: seed,
  });
  f.padding = 0;
  return f;
}

export function buildFilters(morphAmt: number, tearAmt: number, seed: number): Filter[] | null {
  const filters: Filter[] = [];
  if (morphAmt > 0) filters.push(createMorphFilter(morphAmt, seed));
  if (tearAmt > 0) filters.push(createTearFilter(tearAmt, seed));
  return filters.length > 0 ? filters : null;
}
