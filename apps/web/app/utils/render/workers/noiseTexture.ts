import type { NoiseLayer, NoiseType } from '../../../types/config';
import { hexToRgb, lerp, mixRgb } from '../../colorMath';

export type NoiseTextureLayerConfig = {
  color: string;
  accentColor: string;
  noiseType: NoiseType;
  noiseScale: number;
  noiseDetail: number;
  noiseContrast: number;
  noiseBalance: number;
  noiseWarp: number;
  noiseTurbulence: number;
  noiseThreshold: number;
};

export type NoiseTextureRequest = {
  layer: NoiseTextureLayerConfig;
  seed: number;
  textureSize: number;
};

export type NoiseTextureResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type NoiseTextureParams = {
  size: number;
  base: ReturnType<typeof hexToRgb>;
  accent: ReturnType<typeof hexToRgb>;
  scale: number;
  octaves: number;
  contrast: number;
  balance: number;
  warpAmount: number;
  turbulence: number;
  threshold: number;
};

export function toNoiseTextureLayerConfig(layer: NoiseLayer): NoiseTextureLayerConfig {
  return {
    color: layer.color,
    accentColor: layer.accentColor,
    noiseType: layer.noiseType,
    noiseScale: layer.noiseScale,
    noiseDetail: layer.noiseDetail,
    noiseContrast: layer.noiseContrast,
    noiseBalance: layer.noiseBalance,
    noiseWarp: layer.noiseWarp,
    noiseTurbulence: layer.noiseTurbulence,
    noiseThreshold: layer.noiseThreshold,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function hash2d(x: number, y: number, seed: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 0.013) * 43758.5453123;
  return value - Math.floor(value);
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = hash2d(x0, y0, seed);
  const b = hash2d(x0 + 1, y0, seed);
  const c = hash2d(x0, y0 + 1, seed);
  const d = hash2d(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function fbm(x: number, y: number, seed: number, octaves: number) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + i * 19.17) * amplitude;
    sum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / Math.max(0.0001, sum);
}

function worleyNoise(x: number, y: number, seed: number) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = Infinity;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const px = cellX + offsetX + hash2d(cellX + offsetX, cellY + offsetY, seed);
      const py = cellY + offsetY + hash2d(cellX + offsetX, cellY + offsetY, seed + 73);
      nearest = Math.min(nearest, Math.hypot(px - x, py - y));
    }
  }
  return clamp(nearest / 1.25, 0, 1);
}

function noiseTextureParams(layer: NoiseTextureLayerConfig, textureSize: number): NoiseTextureParams {
  const size = Math.max(1, Math.round(textureSize));
  return {
    size,
    base: hexToRgb(layer.color),
    accent: hexToRgb(layer.accentColor),
    scale: Math.max(1, layer.noiseScale),
    octaves: Math.max(1, Math.round(layer.noiseDetail)),
    contrast: 0.6 + layer.noiseContrast / 45,
    balance: clamp(layer.noiseBalance / 100, 0.05, 0.95),
    warpAmount: clamp((layer.noiseWarp ?? 0) / 100, 0, 1) * 3.2,
    turbulence: clamp((layer.noiseTurbulence ?? 0) / 100, 0, 1),
    threshold: clamp((layer.noiseThreshold ?? 0) / 100, 0, 1),
  };
}

function warpedNoisePoint(x: number, y: number, seed: number, params: NoiseTextureParams) {
  const nx = x / params.scale;
  const ny = y / params.scale;
  if (params.warpAmount <= 0) return { nx, ny };
  const warpOctaves = Math.max(2, params.octaves);
  const warpX = fbm(nx * 0.42 + 17.3, ny * 0.42 - 4.1, seed + 101, warpOctaves);
  const warpY = fbm(nx * 0.42 - 8.7, ny * 0.42 + 21.6, seed + 211, warpOctaves);
  return {
    nx: nx + (warpX - 0.5) * params.warpAmount,
    ny: ny + (warpY - 0.5) * params.warpAmount,
  };
}

function rawNoiseValue(type: NoiseType, nx: number, ny: number, seed: number, octaves: number) {
  if (type === 'cells') return 1 - worleyNoise(nx * 0.8, ny * 0.8, seed);
  if (type === 'value') return octaves > 1 ? fbm(nx, ny, seed, octaves) : valueNoise(nx, ny, seed);
  return fbm(nx, ny, seed, octaves);
}

function turbulentNoiseValue(raw: number, turbulence: number) {
  return turbulence > 0 ? lerp(raw, Math.abs(raw - 0.5) * 2, turbulence) : raw;
}

function noiseAlpha(raw: number, params: NoiseTextureParams) {
  const contrasted = clamp((raw - 0.5) * params.contrast + 0.5, 0, 1);
  const shaped =
    params.threshold === 0 ? contrasted : lerp(contrasted, contrasted >= params.balance ? 1 : 0, params.threshold);
  return clamp((shaped - params.balance) / (1 - params.balance), 0, 1);
}

function writeNoisePixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  raw: number,
  alpha: number,
  params: NoiseTextureParams,
) {
  const color = mixRgb(params.base, params.accent, clamp(raw * 1.1, 0, 1));
  const index = (y * params.size + x) * 4;
  data[index] = color.r;
  data[index + 1] = color.g;
  data[index + 2] = color.b;
  data[index + 3] = Math.round(alpha * 255);
}

function writeNoiseTextureRow(
  data: Uint8ClampedArray,
  y: number,
  layer: NoiseTextureLayerConfig,
  seed: number,
  params: NoiseTextureParams,
) {
  for (let x = 0; x < params.size; x += 1) {
    const { nx, ny } = warpedNoisePoint(x, y, seed, params);
    const raw = turbulentNoiseValue(rawNoiseValue(layer.noiseType, nx, ny, seed, params.octaves), params.turbulence);
    writeNoisePixel(data, x, y, raw, noiseAlpha(raw, params), params);
  }
}

export function generateNoiseTextureData({ layer, seed, textureSize }: NoiseTextureRequest): NoiseTextureResult {
  const params = noiseTextureParams(layer, textureSize);
  const data = new Uint8ClampedArray(params.size * params.size * 4);

  for (let y = 0; y < params.size; y += 1) {
    writeNoiseTextureRow(data, y, layer, seed, params);
  }

  return { width: params.size, height: params.size, data };
}
