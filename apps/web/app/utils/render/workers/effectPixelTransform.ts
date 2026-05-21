import { lcg } from '../../lcg';

export type EffectPixelTransformOp =
  | { type: 'rgbSplit'; amount: number }
  | { type: 'colorPass'; sepia: number; infrared: number; ca: number; dither: number }
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

  if (sepiaT > 0 || infraredT > 0) {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (sepiaT > 0) {
        const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        r = Math.round(r + (sr - r) * sepiaT);
        g = Math.round(g + (sg - g) * sepiaT);
        b = Math.round(b + (sb - b) * sepiaT);
      }

      if (infraredT > 0) {
        const ir = r;
        const ig = g;
        const ib = b;
        r = Math.min(255, Math.round(ir + ig * infraredT * 0.8));
        g = Math.min(255, Math.round(ig * (1 - infraredT * 0.65)));
        b = Math.min(255, Math.round(ib * (1 - infraredT * 0.3) + infraredT * 22));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  if (operation.ca > 0) {
    const amount = Math.round(operation.ca);
    const cx = width / 2;
    const cy = height / 2;
    const copy = new Uint8ClampedArray(data);
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = pixelIndex(width, x, y);
        const dx = (x - cx) / maxDist;
        const dy = (y - cy) / maxDist;
        const rx = Math.min(width - 1, Math.max(0, Math.round(x + dx * amount)));
        const ry = Math.min(height - 1, Math.max(0, Math.round(y + dy * amount)));
        const bx = Math.min(width - 1, Math.max(0, Math.round(x - dx * amount)));
        const by = Math.min(height - 1, Math.max(0, Math.round(y - dy * amount)));
        data[i] = copy[pixelIndex(width, rx, ry)];
        data[i + 2] = copy[pixelIndex(width, bx, by) + 2];
      }
    }
  }

  if (operation.dither > 0) {
    const levels = Math.max(2, Math.round(16 - operation.dither * 0.14));
    const step = 255 / (levels - 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = pixelIndex(width, x, y);
        const bayer = BAYER[y & 3][x & 3] / 16;
        for (let c = 0; c < 3; c += 1) {
          data[i + c] = Math.min(255, Math.max(0, Math.round(data[i + c] / step + bayer) * step));
        }
      }
    }
  }
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
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
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
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const shift = Math.sin(dist * freq) * maxShift;
      const nx = Math.min(width - 1, Math.max(0, Math.round(cx + (dist + shift) * Math.cos(angle))));
      const ny = Math.min(height - 1, Math.max(0, Math.round(cy + (dist + shift) * Math.sin(angle))));
      const oi = pixelIndex(width, x, y);
      const si = pixelIndex(width, nx, ny);
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
    }
  }
  return out;
}

function applyKaleidoscope(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return data;
  const segments = Math.max(3, Math.round(3 + (amount / 100) * 13));
  const sectorAngle = (Math.PI * 2) / segments;
  const cx = width / 2;
  const cy = height / 2;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;
      let a = angle % sectorAngle;
      if (a > sectorAngle / 2) a = sectorAngle - a;
      const nx = Math.min(width - 1, Math.max(0, Math.round(cx + dist * Math.cos(a))));
      const ny = Math.min(height - 1, Math.max(0, Math.round(cy + dist * Math.sin(a))));
      const oi = pixelIndex(width, x, y);
      const si = pixelIndex(width, nx, ny);
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
    }
  }
  return out;
}

function applySqueeze(data: Uint8ClampedArray, width: number, height: number, xAmount: number, yAmount: number) {
  if (xAmount === 0 && yAmount === 0) return data;
  const xFactor = Math.max(0.01, 1 + xAmount / 100);
  const yFactor = Math.max(0.01, 1 + yAmount / 100);
  const cx = width / 2;
  const cy = height / 2;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, Math.round(cx + (x - cx) / xFactor)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(cy + (y - cy) / yFactor)));
      const oi = pixelIndex(width, x, y);
      const si = pixelIndex(width, sx, sy);
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
    }
  }
  return out;
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
