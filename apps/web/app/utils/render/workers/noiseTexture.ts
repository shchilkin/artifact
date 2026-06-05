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

export function generateNoiseTextureData({ layer, seed, textureSize }: NoiseTextureRequest): NoiseTextureResult {
  const size = Math.max(1, Math.round(textureSize));
  const data = new Uint8ClampedArray(size * size * 4);
  const base = hexToRgb(layer.color);
  const accent = hexToRgb(layer.accentColor);
  const scale = Math.max(1, layer.noiseScale);
  const octaves = Math.max(1, Math.round(layer.noiseDetail));
  const contrast = 0.6 + layer.noiseContrast / 45;
  const balance = clamp(layer.noiseBalance / 100, 0.05, 0.95);
  const warpAmount = clamp((layer.noiseWarp ?? 0) / 100, 0, 1) * 3.2;
  const turbulence = clamp((layer.noiseTurbulence ?? 0) / 100, 0, 1);
  const threshold = clamp((layer.noiseThreshold ?? 0) / 100, 0, 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let nx = x / scale;
      let ny = y / scale;
      if (warpAmount > 0) {
        const warpX = fbm(nx * 0.42 + 17.3, ny * 0.42 - 4.1, seed + 101, Math.max(2, octaves));
        const warpY = fbm(nx * 0.42 - 8.7, ny * 0.42 + 21.6, seed + 211, Math.max(2, octaves));
        nx += (warpX - 0.5) * warpAmount;
        ny += (warpY - 0.5) * warpAmount;
      }
      let raw =
        layer.noiseType === 'cells'
          ? 1 - worleyNoise(nx * 0.8, ny * 0.8, seed)
          : layer.noiseType === 'value'
            ? octaves > 1
              ? fbm(nx, ny, seed, octaves)
              : valueNoise(nx, ny, seed)
            : fbm(nx, ny, seed, octaves);
      if (turbulence > 0) {
        raw = lerp(raw, Math.abs(raw - 0.5) * 2, turbulence);
      }
      const contrasted = clamp((raw - 0.5) * contrast + 0.5, 0, 1);
      const shaped = threshold === 0 ? contrasted : lerp(contrasted, contrasted >= balance ? 1 : 0, threshold);
      const alpha = clamp((shaped - balance) / (1 - balance), 0, 1);
      const color = mixRgb(base, accent, clamp(raw * 1.1, 0, 1));
      const index = (y * size + x) * 4;
      data[index] = color.r;
      data[index + 1] = color.g;
      data[index + 2] = color.b;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  return { width: size, height: size, data };
}
