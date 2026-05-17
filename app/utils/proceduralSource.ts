import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { SourceLayer } from '../types/config';
import { lcg } from './lcg';
import { renderPrimitiveToCanvas } from './primitiveRenderer';
import { toNoiseTextureLayerConfig } from './render/workers/noiseTexture';
import { renderNoiseTexture } from './render/workers/noiseTextureClient';

type Rgb = { r: number; g: number; b: number };

const SOURCE_SIZE = 540;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

async function drawNoiseLayer(
  ctx: CanvasRenderingContext2D,
  layer: SourceLayer,
  seed: number,
  draft: boolean,
  drawWidth = SOURCE_SIZE,
  drawHeight = SOURCE_SIZE,
) {
  const textureSize = draft ? 192 : 384;
  const canvas = document.createElement('canvas');
  canvas.width = textureSize;
  canvas.height = textureSize;
  const noiseCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!noiseCtx) return;

  const texture = await renderNoiseTexture({
    layer: toNoiseTextureLayerConfig(layer),
    seed,
    textureSize,
  });
  const image = noiseCtx.createImageData(texture.width, texture.height);
  image.data.set(texture.data);
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
    await drawNoiseLayer(ctx, layer, seed + (layer.seedOffset ?? 0), draft, drawWidth, drawHeight);
  } else {
    drawArrayLayer(ctx, layer, seed);
  }

  ctx.restore();
}
