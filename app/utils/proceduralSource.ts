import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { SourceLayer } from '../types/config';
import { lcg } from './lcg';
import { renderPrimitiveToCanvas } from './primitiveRenderer';

type Rgb = { r: number; g: number; b: number };

const SOURCE_SIZE = 540;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;
  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed)) return { r: 255, g: 90, b: 54 };
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: Math.round(lerp(a.r, b.r, amount)),
    g: Math.round(lerp(a.g, b.g, amount)),
    b: Math.round(lerp(a.b, b.b, amount)),
  };
}

function rgbToStyle(color: Rgb, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
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

function drawNoiseLayer(
  ctx: CanvasRenderingContext2D,
  layer: SourceLayer,
  seed: number,
  draft: boolean,
  drawWidth = SOURCE_SIZE,
  drawHeight = SOURCE_SIZE,
) {
  const textureSize = (draft ? 112 : 192) + layer.noiseDetail * (draft ? 10 : 16);
  const canvas = document.createElement('canvas');
  canvas.width = textureSize;
  canvas.height = textureSize;
  const noiseCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!noiseCtx) return;

  const image = noiseCtx.createImageData(textureSize, textureSize);
  const data = image.data;
  const base = hexToRgb(layer.color);
  const accent = hexToRgb(layer.accentColor);
  const scale = Math.max(6, layer.noiseScale);
  const octaves = Math.max(1, Math.round(layer.noiseDetail));
  const contrast = 0.6 + layer.noiseContrast / 45;
  const balance = clamp(layer.noiseBalance / 100, 0.05, 0.95);
  const warpAmount = clamp((layer.noiseWarp ?? 0) / 100, 0, 1) * 3.2;
  const turbulence = clamp((layer.noiseTurbulence ?? 0) / 100, 0, 1);
  const threshold = clamp((layer.noiseThreshold ?? 0) / 100, 0, 1);

  for (let y = 0; y < textureSize; y += 1) {
    for (let x = 0; x < textureSize; x += 1) {
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
            ? valueNoise(nx, ny, seed)
            : fbm(nx, ny, seed, octaves);
      if (turbulence > 0) {
        raw = lerp(raw, Math.abs(raw - 0.5) * 2, turbulence);
      }
      const contrasted = clamp((raw - 0.5) * contrast + 0.5, 0, 1);
      const shaped = threshold === 0 ? contrasted : lerp(contrasted, contrasted >= balance ? 1 : 0, threshold);
      const alpha = clamp((shaped - balance) / (1 - balance), 0, 1);
      const color = mixRgb(base, accent, clamp(raw * 1.1, 0, 1));
      const index = (y * textureSize + x) * 4;
      data[index] = color.r;
      data[index + 1] = color.g;
      data[index + 2] = color.b;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  noiseCtx.putImageData(image, 0, 0);
  ctx.drawImage(canvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
}

function drawArrayShape(
  ctx: CanvasRenderingContext2D,
  shape: SourceLayer['arrayShape'],
  size: number,
  angle: number,
  dimensions?: { width: number; height: number },
) {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  if (shape === 'bar') {
    const barWidth = dimensions?.width ?? size * 1.8;
    const barHeight = dimensions?.height ?? size * 0.44;
    ctx.roundRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, Math.min(barWidth, barHeight) * 0.22);
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.88, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.88, 0);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, size, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawArrayLayer(ctx: CanvasRenderingContext2D, layer: SourceLayer, seed: number) {
  const base = hexToRgb(layer.color);
  const accent = hexToRgb(layer.accentColor);
  const sourceSeed = seed + (layer.seedOffset ?? 0);
  const rng = lcg(sourceSeed ^ 0x58f173);
  const size = Math.max(6, layer.arraySize);

  const drawItem = (
    x: number,
    y: number,
    angle: number,
    index: number,
    dimensions?: { width: number; height: number },
  ) => {
    const jitter = layer.arrayJitter;
    const offsetX = jitter === 0 ? 0 : (rng() - 0.5) * jitter * 2;
    const offsetY = jitter === 0 ? 0 : (rng() - 0.5) * jitter * 2;
    const color = index % 2 === 0 ? base : mixRgb(base, accent, 0.5);
    ctx.save();
    ctx.translate(x + offsetX, y + offsetY);
    ctx.fillStyle = rgbToStyle(color, 0.92);
    ctx.strokeStyle = rgbToStyle(mixRgb(color, accent, 0.35), 0.45);
    ctx.lineWidth = 1;
    drawArrayShape(ctx, layer.arrayShape, size, angle, dimensions);
    ctx.stroke();
    ctx.restore();
  };

  if (layer.arrayPattern === 'line') {
    const count = Math.max(2, Math.round(layer.arrayCount));
    const gap = Math.max(12, layer.arrayGap);
    const rows = Math.max(1, Math.round(layer.arrayRows));
    const rowGap =
      layer.arrayShape === 'bar' ? Math.max(size * 1.18, layer.arrayGap, 8) : Math.max(size * 0.75, layer.arrayGap, 8);
    const barDimensions =
      layer.arrayShape === 'bar'
        ? { width: Math.max(2, layer.arrayRadius), height: Math.max(6, layer.arraySize) }
        : undefined;
    const width = (count - 1) * gap;
    const height = (rows - 1) * rowGap;
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let i = 0; i < count; i += 1) {
        drawItem(-width / 2 + i * gap, -height / 2 + row * rowGap, 0, index, barDimensions);
        index += 1;
      }
    }
    return;
  }

  if (layer.arrayPattern === 'radial') {
    const count = Math.max(3, Math.round(layer.arrayCount));
    const rings = Math.max(1, Math.round(layer.arrayRows));
    const baseRadius = Math.max(16, layer.arrayRadius);
    const gap = Math.max(0, layer.arrayGap);
    let index = 0;
    for (let ring = 0; ring < rings; ring += 1) {
      const radius = baseRadius + ring * gap;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        drawItem(Math.cos(angle) * radius, Math.sin(angle) * radius, angle, index);
        index += 1;
      }
    }
    return;
  }

  const columns = Math.max(2, Math.round(layer.arrayCount));
  const rows = Math.max(2, Math.round(layer.arrayRows));
  const gap = Math.max(12, layer.arrayGap);
  const width = (columns - 1) * gap;
  const height = (rows - 1) * gap;
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      drawItem(-width / 2 + col * gap, -height / 2 + row * gap, 0, index);
      index += 1;
    }
  }
}

export async function drawSourceLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: SourceLayer,
  seed: number,
  scale: number,
  draft: boolean,
  primitiveViewState?: PrimitiveViewportState,
  layout: 'document' | 'full-frame' = 'document',
): Promise<void> {
  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = (
    layer.blendMode === 'normal' ? 'source-over' : layer.blendMode
  ) as GlobalCompositeOperation;
  if (layout === 'full-frame') {
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
  } else {
    ctx.translate(width * layer.x, height * layer.y);
    ctx.rotate(degToRad(layer.rotation));
    ctx.scale(scale * layer.scaleX, scale * layer.scaleY);
  }

  if (layer.kind === 'primitive') {
    const drawSize = SOURCE_SIZE;
    const renderSize = Math.min(Math.round(SOURCE_SIZE * Math.max(scale, 1)), 1024);
    const threeCanvas = await renderPrimitiveToCanvas(layer, renderSize, primitiveViewState, { forceFallback: draft });
    ctx.drawImage(threeCanvas, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  } else if (layer.kind === 'noise') {
    const drawWidth = layout === 'full-frame' ? width / scale : SOURCE_SIZE;
    const drawHeight = layout === 'full-frame' ? height / scale : SOURCE_SIZE;
    drawNoiseLayer(ctx, layer, seed + (layer.seedOffset ?? 0), draft, drawWidth, drawHeight);
  } else {
    drawArrayLayer(ctx, layer, seed);
  }

  ctx.restore();
}
