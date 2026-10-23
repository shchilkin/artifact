/** Spatial effect pixel kernels: blurs, displacement, edges, and texture. */
import { lcg } from '../../lcg';
import { clampByte, copyPixel, hexByte, pixelIndex, polarOffset, remapPixels } from './effectPixelHelpers';

export function applyBokehBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  threshold: number,
) {
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

export function applyHatching(
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

export function applyPixelStretch(
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

export function applyPatternRefraction(
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

export function applyGooeyMerge(
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

export function applyEdgeCrush(data: Uint8ClampedArray, width: number, height: number, amount: number) {
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

export function applySilhouetteCrush(data: Uint8ClampedArray, width: number, height: number, amount: number) {
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

export function applyVhsTracking(data: Uint8ClampedArray, width: number, height: number, amount: number, seed: number) {
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

export function applyWave(
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

export function applyRipple(
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

export function applyKaleidoscope(data: Uint8ClampedArray, width: number, height: number, amount: number) {
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

export function applySqueeze(data: Uint8ClampedArray, width: number, height: number, xAmount: number, yAmount: number) {
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

export function applyFog(data: Uint8ClampedArray, amount: number, color: string) {
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
