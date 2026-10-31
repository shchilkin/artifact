import { BAYER, clampByte, hexByte, nearestPaletteColor, pixelIndex } from './effectPixelHelpers';
import type { EffectPixelTransformOp } from './effectPixelTypes';

export function applyRgbSplit(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const offset = Math.round(amount);
  const copy = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = pixelIndex(width, x, y);
      const rx = Math.min(width - 1, x + offset);
      const ry = Math.min(height - 1, y + offset);
      const bx = Math.max(0, x - offset);
      const by = Math.max(0, y - offset);
      data[i] = copy[pixelIndex(width, rx, ry)];
      data[i + 2] = copy[pixelIndex(width, bx, by) + 2];
    }
  }
}

export function applyColorPass(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  operation: Extract<EffectPixelTransformOp, { type: 'colorPass' }>,
) {
  const sepiaT = operation.sepia / 100;
  const infraredT = operation.infrared / 100;
  applySepiaInfraredPass(data, sepiaT, infraredT);
  applyChromaticAberration(data, width, height, operation.ca);
  applyDitherPass(data, width, height, operation.dither);
}

function applySepiaInfraredPass(data: Uint8ClampedArray, sepiaT: number, infraredT: number) {
  if (sepiaT > 0 || infraredT > 0) {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (sepiaT > 0) ({ r, g, b } = sepiaPixel(r, g, b, sepiaT));
      if (infraredT > 0) ({ r, g, b } = infraredPixel(r, g, b, infraredT));

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
}

function sepiaPixel(r: number, g: number, b: number, amount: number) {
  const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
  const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
  const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
  return {
    r: Math.round(r + (sr - r) * amount),
    g: Math.round(g + (sg - g) * amount),
    b: Math.round(b + (sb - b) * amount),
  };
}

function infraredPixel(r: number, g: number, b: number, amount: number) {
  return {
    r: Math.min(255, Math.round(r + g * amount * 0.8)),
    g: Math.min(255, Math.round(g * (1 - amount * 0.65))),
    b: Math.min(255, Math.round(b * (1 - amount * 0.3) + amount * 22)),
  };
}

function applyChromaticAberration(data: Uint8ClampedArray, width: number, height: number, amountValue: number) {
  if (amountValue <= 0) return;
  const amount = Math.round(amountValue);
  const cx = width / 2;
  const cy = height / 2;
  const copy = new Uint8ClampedArray(data);
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      applyChromaticAberrationPixel(data, copy, width, height, x, y, { amount, cx, cy, maxDist });
    }
  }
}

function applyChromaticAberrationPixel(
  data: Uint8ClampedArray,
  copy: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  params: { amount: number; cx: number; cy: number; maxDist: number },
) {
  const i = pixelIndex(width, x, y);
  const dx = (x - params.cx) / params.maxDist;
  const dy = (y - params.cy) / params.maxDist;
  const rx = Math.min(width - 1, Math.max(0, Math.round(x + dx * params.amount)));
  const ry = Math.min(height - 1, Math.max(0, Math.round(y + dy * params.amount)));
  const bx = Math.min(width - 1, Math.max(0, Math.round(x - dx * params.amount)));
  const by = Math.min(height - 1, Math.max(0, Math.round(y - dy * params.amount)));
  data[i] = copy[pixelIndex(width, rx, ry)];
  data[i + 2] = copy[pixelIndex(width, bx, by) + 2];
}

function applyDitherPass(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const levels = Math.max(2, Math.round(16 - amount * 0.14));
  const step = 255 / (levels - 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      applyDitherPixel(data, width, x, y, step);
    }
  }
}

function applyDitherPixel(data: Uint8ClampedArray, width: number, x: number, y: number, step: number) {
  const i = pixelIndex(width, x, y);
  const bayer = BAYER[y & 3][x & 3] / 16;
  for (let c = 0; c < 3; c += 1) {
    data[i + c] = Math.min(255, Math.max(0, Math.round(data[i + c] / step + bayer) * step));
  }
}

function parsePaletteColor(hex: string): [number, number, number] {
  return [hexByte(hex, 1), hexByte(hex, 3), hexByte(hex, 5)];
}

export function applyIndexedPalette(data: Uint8ClampedArray, amount: number, colorValues: string[]) {
  if (amount <= 0) return;
  const palette = colorValues.map(parsePaletteColor).filter(([r, g, b]) => r + g + b > 0 || colorValues.length > 0);
  if (palette.length < 2) return;
  const t = Math.min(1, amount / 100);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 0) continue;
    const target = nearestPaletteColor(data[i], data[i + 1], data[i + 2], palette);
    data[i] = clampByte(data[i] + (target[0] - data[i]) * t);
    data[i + 1] = clampByte(data[i + 1] + (target[1] - data[i + 1]) * t);
    data[i + 2] = clampByte(data[i + 2] + (target[2] - data[i + 2]) * t);
  }
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function gradientMapColor(
  lum: number,
  shadow: [number, number, number],
  mid: [number, number, number],
  highlight: [number, number, number],
): [number, number, number] {
  if (lum <= 0.5) return lerpColor(shadow, mid, lum * 2);
  return lerpColor(mid, highlight, (lum - 0.5) * 2);
}

export function applyGradientMap(
  data: Uint8ClampedArray,
  amount: number,
  shadowHex: string,
  midHex: string,
  highlightHex: string,
) {
  if (amount <= 0) return;
  const t = Math.min(1, Math.max(0, amount / 100));
  const shadow = parsePaletteColor(shadowHex);
  const mid = parsePaletteColor(midHex);
  const highlight = parsePaletteColor(highlightHex);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const mapped = gradientMapColor(lum, shadow, mid, highlight);
    data[i] = clampByte(r + (mapped[0] - r) * t);
    data[i + 1] = clampByte(g + (mapped[1] - g) * t);
    data[i + 2] = clampByte(b + (mapped[2] - b) * t);
  }
}

function signedMixChannel(source: number, target: number, amount: number) {
  const t = Math.min(1, Math.abs(amount) / 100);
  return amount >= 0 ? source + (target - source) * t : source + (source - target) * t;
}

export function applyChannelMixer(
  data: Uint8ClampedArray,
  amount: number,
  redMix: number,
  greenMix: number,
  blueMix: number,
) {
  if (amount <= 0) return;
  const t = Math.min(1, Math.max(0, amount / 100));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const mixedR = signedMixChannel(r, g, redMix);
    const mixedG = signedMixChannel(g, b, greenMix);
    const mixedB = signedMixChannel(b, r, blueMix);
    data[i] = clampByte(r + (mixedR - r) * t);
    data[i + 1] = clampByte(g + (mixedG - g) * t);
    data[i + 2] = clampByte(b + (mixedB - b) * t);
  }
}

export function applySolarize(data: Uint8ClampedArray, amount: number) {
  if (amount <= 0) return;
  const threshold = 255 * (1 - (amount / 100) * 0.85);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum > threshold) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }
}

export function applyBleachBypass(data: Uint8ClampedArray, amount: number) {
  if (amount <= 0) return;
  const t = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const overlay = (value: number) =>
      value < 128 ? (2 * value * lum) / 255 : 255 - (2 * (255 - value) * (255 - lum)) / 255;
    data[i] = clampByte(r + (overlay(r) - r) * t);
    data[i + 1] = clampByte(g + (overlay(g) - g) * t);
    data[i + 2] = clampByte(b + (overlay(b) - b) * t);
  }
}

export function applyCyanotype(data: Uint8ClampedArray, amount: number) {
  if (amount <= 0) return;
  const t = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const cr = Math.round(235 * lum);
    const cg = Math.round(49 + (240 - 49) * lum);
    const cb = Math.round(83 + (230 - 83) * lum);
    data[i] = Math.round(data[i] + (cr - data[i]) * t);
    data[i + 1] = Math.round(data[i + 1] + (cg - data[i + 1]) * t);
    data[i + 2] = Math.round(data[i + 2] + (cb - data[i + 2]) * t);
  }
}

export function applySplitTone(data: Uint8ClampedArray, amount: number, shadow: string, highlight: string) {
  if (amount <= 0) return;
  const t = amount / 100;
  const sR = hexByte(shadow, 1);
  const sG = hexByte(shadow, 3);
  const sB = hexByte(shadow, 5);
  const hR = hexByte(highlight, 1);
  const hG = hexByte(highlight, 3);
  const hB = hexByte(highlight, 5);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const sw = Math.max(0, (128 - lum) / 128);
    const hw = Math.max(0, (lum - 128) / 128);
    data[i] = Math.min(255, Math.round(data[i] + (sR - data[i]) * sw * t + (hR - data[i]) * hw * t));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] + (sG - data[i + 1]) * sw * t + (hG - data[i + 1]) * hw * t));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] + (sB - data[i + 2]) * sw * t + (hB - data[i + 2]) * hw * t));
  }
}
