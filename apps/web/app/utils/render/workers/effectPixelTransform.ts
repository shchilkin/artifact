import { applyChromaticAberration } from '@shchilkin/artifact-runtime/rendering';
import { lcg } from '../../lcg';

export type EffectPixelTransformOp =
  | { type: 'rgbSplit'; amount: number }
  | { type: 'colorPass'; sepia: number; infrared: number; ca: number; dither: number }
  | { type: 'indexedPalette'; amount: number; colors: string[] }
  | { type: 'gradientMap'; amount: number; shadow: string; mid: string; highlight: string }
  | { type: 'channelMixer'; amount: number; redMix: number; greenMix: number; blueMix: number }
  | { type: 'edgeCrush'; amount: number }
  | { type: 'silhouetteCrush'; amount: number }
  | { type: 'bokehBlur'; amount: number; threshold: number }
  | { type: 'hatching'; amount: number; scale: number; angle: number }
  | { type: 'pixelStretch'; amount: number; length: number; angle: number }
  | { type: 'patternRefraction'; amount: number; scale: number; angle: number }
  | { type: 'gooeyMerge'; amount: number; radius: number; threshold: number }
  | { type: 'vhsTracking'; amount: number; seed: number }
  | { type: 'wave'; amount: number; frequency: number; scale: number }
  | { type: 'solarize'; amount: number }
  | { type: 'bleachBypass'; amount: number }
  | { type: 'cyanotype'; amount: number }
  | { type: 'splitTone'; amount: number; shadow: string; highlight: string }
  | { type: 'ripple'; amount: number; frequency: number; scale: number }
  | { type: 'kaleidoscope'; amount: number }
  | { type: 'squeeze'; x: number; y: number }
  | { type: 'fog'; amount: number; color: string };

export type EffectPixelTransformRequest = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  operations: EffectPixelTransformOp[];
};

export type EffectPixelTransformResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function hexByte(hex: string, start: number) {
  const parsed = Number.parseInt(hex.slice(start, start + 2), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function copyPixel(out: Uint8ClampedArray, outIndex: number, data: Uint8ClampedArray, sourceIndex: number) {
  out[outIndex] = data[sourceIndex];
  out[outIndex + 1] = data[sourceIndex + 1];
  out[outIndex + 2] = data[sourceIndex + 2];
  out[outIndex + 3] = data[sourceIndex + 3];
}

function remapPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sourcePoint: (x: number, y: number) => { x: number; y: number },
) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = sourcePoint(x, y);
      copyPixel(out, pixelIndex(width, x, y), data, pixelIndex(width, source.x, source.y));
    }
  }
  return out;
}

function polarOffset(x: number, y: number, cx: number, cy: number) {
  const dx = x - cx;
  const dy = y - cy;
  return { dx, dy, dist: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) };
}

export function transformEffectPixels({
  width,
  height,
  data,
  operations,
}: EffectPixelTransformRequest): EffectPixelTransformResult {
  let current = data;

  for (const operation of operations) {
    if (operation.type === 'rgbSplit') {
      applyRgbSplit(current, width, height, operation.amount);
    } else if (operation.type === 'colorPass') {
      applyColorPass(current, width, height, operation);
    } else if (operation.type === 'indexedPalette') {
      applyIndexedPalette(current, operation.amount, operation.colors);
    } else if (operation.type === 'gradientMap') {
      applyGradientMap(current, operation.amount, operation.shadow, operation.mid, operation.highlight);
    } else if (operation.type === 'channelMixer') {
      applyChannelMixer(current, operation.amount, operation.redMix, operation.greenMix, operation.blueMix);
    } else if (operation.type === 'edgeCrush') {
      applyEdgeCrush(current, width, height, operation.amount);
    } else if (operation.type === 'silhouetteCrush') {
      current = applySilhouetteCrush(current, width, height, operation.amount);
    } else if (operation.type === 'bokehBlur') {
      current = applyBokehBlur(current, width, height, operation.amount, operation.threshold);
    } else if (operation.type === 'hatching') {
      applyHatching(current, width, height, operation.amount, operation.scale, operation.angle);
    } else if (operation.type === 'pixelStretch') {
      current = applyPixelStretch(current, width, height, operation.amount, operation.length, operation.angle);
    } else if (operation.type === 'patternRefraction') {
      current = applyPatternRefraction(current, width, height, operation.amount, operation.scale, operation.angle);
    } else if (operation.type === 'gooeyMerge') {
      current = applyGooeyMerge(current, width, height, operation.amount, operation.radius, operation.threshold);
    } else if (operation.type === 'vhsTracking') {
      current = applyVhsTracking(current, width, height, operation.amount, operation.seed);
    } else if (operation.type === 'wave') {
      current = applyWave(current, width, height, operation.amount, operation.frequency, operation.scale);
    } else if (operation.type === 'solarize') {
      applySolarize(current, operation.amount);
    } else if (operation.type === 'bleachBypass') {
      applyBleachBypass(current, operation.amount);
    } else if (operation.type === 'cyanotype') {
      applyCyanotype(current, operation.amount);
    } else if (operation.type === 'splitTone') {
      applySplitTone(current, operation.amount, operation.shadow, operation.highlight);
    } else if (operation.type === 'ripple') {
      current = applyRipple(current, width, height, operation.amount, operation.frequency, operation.scale);
    } else if (operation.type === 'kaleidoscope') {
      current = applyKaleidoscope(current, width, height, operation.amount);
    } else if (operation.type === 'squeeze') {
      current = applySqueeze(current, width, height, operation.x, operation.y);
    } else {
      applyFog(current, operation.amount, operation.color);
    }
  }

  return { width, height, data: current };
}

function applyRgbSplit(data: Uint8ClampedArray, width: number, height: number, amount: number) {
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

function applyColorPass(
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

function applyIndexedPalette(data: Uint8ClampedArray, amount: number, colorValues: string[]) {
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

function applyGradientMap(
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

function applyChannelMixer(data: Uint8ClampedArray, amount: number, redMix: number, greenMix: number, blueMix: number) {
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

function applyBokehBlur(data: Uint8ClampedArray, width: number, height: number, amount: number, threshold: number) {
  if (amount <= 0) return data;
  const radius = Math.min(18, Math.max(1, Math.round(amount)));
  const blurred = boxBlur(data, width, height, radius);
  const out = new Uint8ClampedArray(data.length);
  const thresholdLum = Math.min(255, Math.max(0, (threshold / 100) * 255));
  const denom = Math.max(1, 255 - thresholdLum);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const highlight = Math.min(1, Math.max(0, (lum - thresholdLum) / denom));
    out[i] = clampByte(blurred[i] + data[i] * highlight * 0.35);
    out[i + 1] = clampByte(blurred[i + 1] + data[i + 1] * highlight * 0.35);
    out[i + 2] = clampByte(blurred[i + 2] + data[i + 2] * highlight * 0.35);
    out[i + 3] = alpha;
  }

  return out;
}

function boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  const horizontal = new Float32Array(data.length);
  const out = new Uint8ClampedArray(data.length);
  const diameter = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = pixelIndex(width, x, y);
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sx = Math.min(width - 1, Math.max(0, x + k));
          sum += data[pixelIndex(width, sx, y) + c];
        }
        horizontal[target + c] = sum / diameter;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = pixelIndex(width, x, y);
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sy = Math.min(height - 1, Math.max(0, y + k));
          sum += horizontal[pixelIndex(width, x, sy) + c];
        }
        out[target + c] = clampByte(sum / diameter);
      }
    }
  }

  return out;
}

function applyHatching(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  scale: number,
  angle: number,
) {
  if (amount <= 0) return;
  const strength = Math.min(1, Math.max(0, amount / 100));
  const spacing = Math.max(3, scale);
  const theta = (angle / 180) * Math.PI;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const lineWidth = Math.max(0.9, spacing * 0.18);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = pixelIndex(width, x, y);
      if (data[i + 3] <= 0) continue;
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const shade = 1 - lum;
      const u = x * cos + y * sin;
      const phase = Math.abs((((u % spacing) + spacing) % spacing) - spacing / 2);
      const line = phase <= lineWidth * (0.55 + shade);
      if (!line) continue;
      const ink = strength * shade * 0.82;
      data[i] = clampByte(data[i] * (1 - ink));
      data[i + 1] = clampByte(data[i + 1] * (1 - ink));
      data[i + 2] = clampByte(data[i + 2] * (1 - ink));
    }
  }
}

function clampCoord(value: number, max: number) {
  return Math.min(max, Math.max(0, Math.round(value)));
}

function applyPixelStretch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  length: number,
  angle: number,
) {
  if (amount <= 0 || length <= 0) return data;
  const strength = Math.min(1, Math.max(0, amount / 100));
  const sampleLength = Math.max(1, length);
  const sampleCount = Math.min(28, Math.max(3, Math.round(sampleLength / 3)));
  const theta = (angle / 180) * Math.PI;
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = pixelIndex(width, x, y);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let step = 0; step < sampleCount; step += 1) {
        const t = sampleCount <= 1 ? 0 : step / (sampleCount - 1);
        const sx = clampCoord(x - dx * sampleLength * t, width - 1);
        const sy = clampCoord(y - dy * sampleLength * t, height - 1);
        const source = pixelIndex(width, sx, sy);
        r += data[source] ?? 0;
        g += data[source + 1] ?? 0;
        b += data[source + 2] ?? 0;
        a += data[source + 3] ?? 0;
      }
      const inv = 1 / sampleCount;
      out[target] = clampByte((data[target] ?? 0) + (r * inv - (data[target] ?? 0)) * strength);
      out[target + 1] = clampByte((data[target + 1] ?? 0) + (g * inv - (data[target + 1] ?? 0)) * strength);
      out[target + 2] = clampByte((data[target + 2] ?? 0) + (b * inv - (data[target + 2] ?? 0)) * strength);
      out[target + 3] = clampByte((data[target + 3] ?? 0) + (a * inv - (data[target + 3] ?? 0)) * strength);
    }
  }

  return out;
}

function applyPatternRefraction(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  scale: number,
  angle: number,
) {
  if (amount <= 0) return data;
  const strength = Math.min(1, Math.max(0, amount / 100));
  const spacing = Math.max(3, scale);
  const theta = (angle / 180) * Math.PI;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const normalX = -sin;
  const normalY = cos;
  const displacement = spacing * 0.42 * strength;

  return remapPixels(data, width, height, (x, y) => {
    const u = (x * cos + y * sin) / spacing;
    const v = (x * normalX + y * normalY) / spacing;
    const wave = Math.sin(u * Math.PI * 2) * Math.cos(v * Math.PI * 1.2);
    const secondary = Math.sin((u + v) * Math.PI * 1.4) * 0.35;
    const offset = (wave + secondary) * displacement;
    return {
      x: clampCoord(x - normalX * offset - cos * offset * 0.28, width - 1),
      y: clampCoord(y - normalY * offset - sin * offset * 0.28, height - 1),
    };
  });
}

function applyGooeyMerge(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  radius: number,
  threshold: number,
) {
  if (amount <= 0 || radius <= 0) return data;
  const strength = Math.min(1, Math.max(0, amount / 100));
  const blurRadius = Math.min(24, Math.max(1, Math.round(radius)));
  const blurred = boxBlur(data, width, height, blurRadius);
  const out = new Uint8ClampedArray(data.length);
  const cutoff = Math.min(255, Math.max(0, (threshold / 100) * 255));
  const feather = Math.max(8, 42 - threshold * 0.24);

  for (let i = 0; i < data.length; i += 4) {
    const sourceAlpha = data[i + 3] ?? 0;
    const blurAlpha = blurred[i + 3] ?? 0;
    const mergedAlpha = Math.min(255, Math.max(0, ((blurAlpha - cutoff) / feather) * 255));
    const targetAlpha = Math.max(sourceAlpha, mergedAlpha);
    out[i] = clampByte((data[i] ?? 0) + ((blurred[i] ?? 0) - (data[i] ?? 0)) * strength * 0.72);
    out[i + 1] = clampByte((data[i + 1] ?? 0) + ((blurred[i + 1] ?? 0) - (data[i + 1] ?? 0)) * strength * 0.72);
    out[i + 2] = clampByte((data[i + 2] ?? 0) + ((blurred[i + 2] ?? 0) - (data[i + 2] ?? 0)) * strength * 0.72);
    out[i + 3] = clampByte(sourceAlpha + (targetAlpha - sourceAlpha) * strength);
  }

  return out;
}

function nearestPaletteColor(
  r: number,
  g: number,
  b: number,
  palette: Array<[number, number, number]>,
): [number, number, number] {
  let best = palette[0] ?? [0, 0, 0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const lumDelta = 0.299 * dr + 0.587 * dg + 0.114 * db;
    const distance = dr * dr * 0.7 + dg * dg + db * db * 0.8 + lumDelta * lumDelta * 0.6;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

function applyEdgeCrush(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const strength = Math.min(1, amount / 100);
  const threshold = 24 + (amount / 100) * 180;
  const feather = Math.max(1, 40 - amount * 0.32);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha <= 0 || alpha >= 255) continue;
    const hardAlpha = alpha >= threshold ? 255 : 0;
    const t = Math.min(1, amount / 100 + Math.abs(alpha - threshold) / feather);
    data[i + 3] = clampByte(alpha + (hardAlpha - alpha) * t);
  }

  const trimCutoff = Math.max(0, strength - 0.35) * 0.55;
  if (trimCutoff <= 0) return;

  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) alpha[p] = data[i + 3] ?? 0;
  const radius = edgeCrushRadius(width, height, strength);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      if ((alpha[p] ?? 0) <= 0) continue;
      if (!hasAlphaNeighbor(alpha, width, height, x, y, false, radius)) continue;
      if (silhouetteNoise(x, y) < trimCutoff) data[i + 3] = 0;
    }
  }
}

function applySilhouetteCrush(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return data;
  const out = new Uint8ClampedArray(data);
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) alpha[p] = data[i + 3] ?? 0;

  const strength = Math.min(1, amount / 100);
  const removeCutoff = strength * 0.58;
  const addCutoff = strength * 0.42;
  const radius = silhouetteCrushRadius(width, height, strength);
  const cellSize = Math.max(2, Math.round(radius * 1.6));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const ownAlpha = alpha[p] ?? 0;
      const neighbor = strongestNeighbor(alpha, data, width, height, x, y, radius);
      const touchesOutside = ownAlpha > 0 && hasAlphaNeighbor(alpha, width, height, x, y, false, radius);
      const touchesInside = ownAlpha <= 0 && neighbor !== null;
      const noise = silhouetteNoise(Math.floor(x / cellSize), Math.floor(y / cellSize));

      if (touchesOutside && noise < removeCutoff) {
        out[i + 3] = 0;
      } else if (touchesInside && noise > 1 - addCutoff) {
        out[i] = data[neighbor] ?? 0;
        out[i + 1] = data[neighbor + 1] ?? 0;
        out[i + 2] = data[neighbor + 2] ?? 0;
        out[i + 3] = 255;
      } else if (ownAlpha > 0) {
        const colorNeighbor = strongestColorNeighbor(data, width, height, x, y, radius);
        const contrastThreshold = 30 + (1 - strength) * 45;
        const chipsColorEdge =
          colorNeighbor !== null &&
          colorNeighbor.distance >= contrastThreshold &&
          (noise < strength * 0.46 || noise > 1 - strength * 0.52);

        if (chipsColorEdge) {
          const mix = 0.62 + strength * 0.38;
          out[i] = clampByte((data[i] ?? 0) + ((data[colorNeighbor.index] ?? 0) - (data[i] ?? 0)) * mix);
          out[i + 1] = clampByte(
            (data[i + 1] ?? 0) + ((data[colorNeighbor.index + 1] ?? 0) - (data[i + 1] ?? 0)) * mix,
          );
          out[i + 2] = clampByte(
            (data[i + 2] ?? 0) + ((data[colorNeighbor.index + 2] ?? 0) - (data[i + 2] ?? 0)) * mix,
          );
        }
      }
    }
  }

  return out;
}

function hasAlphaNeighbor(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  visible: boolean,
  radius = 1,
) {
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        if (!visible) return true;
        continue;
      }
      const value = alpha[ny * width + nx] ?? 0;
      if (visible ? value > 0 : value <= 0) return true;
    }
  }
  return false;
}

function strongestNeighbor(
  alpha: Uint8ClampedArray,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 1,
) {
  let best: number | null = null;
  let bestAlpha = 0;
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const p = ny * width + nx;
      const value = alpha[p] ?? 0;
      if (value > bestAlpha) {
        bestAlpha = value;
        best = p * 4;
      }
    }
  }
  return bestAlpha > 0 && best !== null && (data[best + 3] ?? 0) > 0 ? best : null;
}

function strongestColorNeighbor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 1,
) {
  const ownIndex = pixelIndex(width, x, y);
  let best: { index: number; distance: number } | null = null;
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighborIndex = pixelIndex(width, nx, ny);
      if ((data[neighborIndex + 3] ?? 0) <= 0) continue;
      const distance = colorEdgeDistance(data, ownIndex, neighborIndex);
      if (best === null || distance > best.distance) best = { index: neighborIndex, distance };
    }
  }
  return best;
}

function colorEdgeDistance(data: Uint8ClampedArray, a: number, b: number) {
  const dr = (data[a] ?? 0) - (data[b] ?? 0);
  const dg = (data[a + 1] ?? 0) - (data[b + 1] ?? 0);
  const db = (data[a + 2] ?? 0) - (data[b + 2] ?? 0);
  const lumDelta = Math.abs(0.299 * dr + 0.587 * dg + 0.114 * db);
  return lumDelta + (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) * 0.22;
}

function edgeCrushRadius(width: number, height: number, strength: number) {
  return Math.max(1, Math.min(4, Math.round(Math.min(width, height) * 0.0025 * strength)));
}

function silhouetteCrushRadius(width: number, height: number, strength: number) {
  return Math.max(1, Math.min(12, Math.round(Math.min(width, height) * 0.006 * strength)));
}

function silhouetteNoise(x: number, y: number) {
  let value = Math.imul(x + 101, 374761393) ^ Math.imul(y + 53, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function applyVhsTracking(data: Uint8ClampedArray, width: number, height: number, amount: number, seed: number) {
  if (amount <= 0) return data;
  const bands = Math.max(3, Math.floor(amount * 0.25 + 3));
  const maxShift = Math.max(1, Math.floor((amount * 0.08 * width) / 100));
  const out = new Uint8ClampedArray(data.length);
  const bandH = Math.ceil(height / bands);
  const rng = lcg(seed);
  for (let band = 0; band < bands; band += 1) {
    const shiftX = Math.floor((rng() - 0.5) * 2 * maxShift);
    const shiftR = Math.floor((rng() - 0.5) * maxShift * 0.5);
    const y0 = band * bandH;
    const y1 = Math.min(height, y0 + bandH);
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const oi = pixelIndex(width, x, y);
        const sx = Math.min(width - 1, Math.max(0, x + shiftX));
        const si = pixelIndex(width, sx, y);
        const srx = Math.min(width - 1, Math.max(0, x + shiftX + shiftR));
        const sri = pixelIndex(width, srx, y);
        out[oi] = data[sri];
        out[oi + 1] = data[si + 1];
        out[oi + 2] = data[si + 2];
        out[oi + 3] = data[si + 3];
      }
    }
  }
  return out;
}

function applyWave(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  frequency: number,
  scale: number,
) {
  if (amount <= 0) return data;
  const maxShift = Math.round(amount * scale * 0.5);
  const freq = (frequency * Math.PI * 2) / height;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    const shift = Math.round(Math.sin(y * freq) * maxShift);
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, x + shift));
      const oi = pixelIndex(width, x, y);
      const si = pixelIndex(width, sx, y);
      copyPixel(out, oi, data, si);
    }
  }
  return out;
}

function applySolarize(data: Uint8ClampedArray, amount: number) {
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

function applyBleachBypass(data: Uint8ClampedArray, amount: number) {
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

function applyCyanotype(data: Uint8ClampedArray, amount: number) {
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

function applySplitTone(data: Uint8ClampedArray, amount: number, shadow: string, highlight: string) {
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

function applyRipple(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  frequency: number,
  scale: number,
) {
  if (amount <= 0) return data;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const maxShift = amount * scale * 0.5;
  const freq = (frequency * Math.PI * 2) / maxDist;
  return remapPixels(data, width, height, (x, y) => {
    const { dist, angle } = polarOffset(x, y, cx, cy);
    const shift = Math.sin(dist * freq) * maxShift;
    return {
      x: Math.min(width - 1, Math.max(0, Math.round(cx + (dist + shift) * Math.cos(angle)))),
      y: Math.min(height - 1, Math.max(0, Math.round(cy + (dist + shift) * Math.sin(angle)))),
    };
  });
}

function applyKaleidoscope(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return data;
  const segments = Math.max(3, Math.round(3 + (amount / 100) * 13));
  const sectorAngle = (Math.PI * 2) / segments;
  const cx = width / 2;
  const cy = height / 2;
  return remapPixels(data, width, height, (x, y) => {
    const offset = polarOffset(x, y, cx, cy);
    let angle = offset.angle;
    if (angle < 0) angle += Math.PI * 2;
    let a = angle % sectorAngle;
    if (a > sectorAngle / 2) a = sectorAngle - a;
    return {
      x: Math.min(width - 1, Math.max(0, Math.round(cx + offset.dist * Math.cos(a)))),
      y: Math.min(height - 1, Math.max(0, Math.round(cy + offset.dist * Math.sin(a)))),
    };
  });
}

function applySqueeze(data: Uint8ClampedArray, width: number, height: number, xAmount: number, yAmount: number) {
  if (xAmount === 0 && yAmount === 0) return data;
  const xFactor = Math.max(0.01, 1 + xAmount / 100);
  const yFactor = Math.max(0.01, 1 + yAmount / 100);
  const cx = width / 2;
  const cy = height / 2;
  return remapPixels(data, width, height, (x, y) => ({
    x: Math.min(width - 1, Math.max(0, Math.round(cx + (x - cx) / xFactor))),
    y: Math.min(height - 1, Math.max(0, Math.round(cy + (y - cy) / yFactor))),
  }));
}

function applyFog(data: Uint8ClampedArray, amount: number, color: string) {
  if (amount <= 0) return;
  const fogR = hexByte(color, 1);
  const fogG = hexByte(color, 3);
  const fogB = hexByte(color, 5);
  const t = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const w = Math.min(1, t * (0.2 + lum * 0.8));
    data[i] = Math.round(data[i] + (fogR - data[i]) * w);
    data[i + 1] = Math.round(data[i + 1] + (fogG - data[i + 1]) * w);
    data[i + 2] = Math.round(data[i + 2] + (fogB - data[i + 2]) * w);
  }
}
