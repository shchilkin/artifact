import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import type { SourceLayer } from '../types/config';
import { hexToRgb, mixRgb, type Rgb } from './colorMath';
import { lcg } from './lcg';
import { renderModelToCanvas } from './modelRenderer';
import { renderPrimitiveToCanvas } from './primitiveRenderer';
import type { MaterialTextureCanvases, ResolvedMaterialConfig } from './primitiveScene';
import { toNoiseTextureLayerConfig } from './render/workers/noiseTexture';
import { renderNoiseTexture } from './render/workers/noiseTextureClient';

const SOURCE_SIZE = 540;

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
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

type DrawArrayItem = (
  x: number,
  y: number,
  angle: number,
  index: number,
  dimensions?: { width: number; height: number },
) => void;

function barArrayDimensions(layer: SourceLayer, size: number) {
  if (layer.arrayShape !== 'bar') return undefined;
  return { width: Math.max(2, layer.arrayRadius), height: Math.max(6, size) };
}

function lineArrayRowGap(layer: SourceLayer, size: number) {
  const minimumGap = 8;
  return layer.arrayShape === 'bar'
    ? Math.max(size * 1.18, layer.arrayGap, minimumGap)
    : Math.max(size * 0.75, layer.arrayGap, minimumGap);
}

function drawLineArray(layer: SourceLayer, size: number, drawItem: DrawArrayItem) {
  const count = Math.max(2, Math.round(layer.arrayCount));
  const gap = Math.max(12, layer.arrayGap);
  const rows = Math.max(1, Math.round(layer.arrayRows));
  const rowGap = lineArrayRowGap(layer, size);
  const barDimensions = barArrayDimensions(layer, size);
  const width = (count - 1) * gap;
  const height = (rows - 1) * rowGap;
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < count; i += 1) {
      drawItem(-width / 2 + i * gap, -height / 2 + row * rowGap, 0, index, barDimensions);
      index += 1;
    }
  }
}

function drawRadialArray(layer: SourceLayer, drawItem: DrawArrayItem) {
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
}

function drawGridArray(layer: SourceLayer, drawItem: DrawArrayItem) {
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
    drawLineArray(layer, size, drawItem);
    return;
  }

  if (layer.arrayPattern === 'radial') {
    drawRadialArray(layer, drawItem);
    return;
  }

  drawGridArray(layer, drawItem);
}

function lineFieldPoint(layer: SourceLayer, x: number, y: number, drawWidth: number, drawHeight: number, seed: number) {
  const strength = Math.max(0, layer.lineFieldStrength);
  if (strength <= 0 || layer.lineFieldDistortion === 'none') return { x, y };

  const nx = x / Math.max(1, drawWidth);
  const ny = y / Math.max(1, drawHeight);
  const freq = Math.max(0.2, layer.lineFieldFrequency);
  const amount = (strength / 100) * Math.min(drawWidth, drawHeight) * 0.26;

  if (layer.lineFieldDistortion === 'wave') {
    return {
      x: x + Math.sin((ny * freq + seed * 0.001) * Math.PI * 2) * amount,
      y: y + Math.sin((nx * freq + seed * 0.0017) * Math.PI * 2) * amount * 0.45,
    };
  }

  if (layer.lineFieldDistortion === 'bulge') {
    const cx = drawWidth / 2;
    const cy = drawHeight / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) / Math.max(1, Math.min(drawWidth, drawHeight) * 0.5);
    const pull = Math.exp(-dist * dist * 2.2) * amount;
    return {
      x: x + (dx / Math.max(1, Math.abs(dx) + Math.abs(dy))) * pull,
      y: y + (dy / Math.max(1, Math.abs(dx) + Math.abs(dy))) * pull,
    };
  }

  const n =
    Math.sin((nx * freq * 2.1 + seed * 0.013) * Math.PI * 2) *
      Math.cos((ny * freq * 1.7 + seed * 0.007) * Math.PI * 2) +
    Math.sin(((nx + ny) * freq + seed * 0.003) * Math.PI * 2) * 0.5;
  return { x: x + n * amount * 0.55, y: y + n * amount };
}

function lineFieldBasePoint(
  orientation: SourceLayer['lineFieldOrientation'],
  lineOffset: number,
  t: number,
  drawWidth: number,
  drawHeight: number,
) {
  const long = Math.max(drawWidth, drawHeight) * 1.6;
  const centerX = drawWidth / 2;
  const centerY = drawHeight / 2;
  if (orientation === 'vertical') return { x: lineOffset, y: centerY - long / 2 + t * long };
  if (orientation === 'diagonal') {
    return {
      x: centerX - long / 2 + t * long,
      y: lineOffset + (t - 0.5) * long * 0.72,
    };
  }
  if (orientation === 'radial') {
    const angle = (lineOffset / Math.max(1, drawWidth)) * Math.PI * 2;
    const radius = t * long * 0.55;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  }
  return { x: centerX - long / 2 + t * long, y: lineOffset };
}

function lineFieldSampleCount(layer: SourceLayer, drawWidth: number, drawHeight: number) {
  const baseSamples = Math.max(24, Math.round(Math.max(drawWidth, drawHeight) / 14));
  if (layer.lineFieldDistortion === 'none' || layer.lineFieldStrength <= 0) return baseSamples;

  const frequency = Math.max(0.2, layer.lineFieldFrequency);
  const pathSpan = layer.lineFieldOrientation === 'radial' ? 1 : 1.6;
  const samplesPerCycle = layer.lineFieldDistortion === 'noise' ? 20 : 18;
  const frequencySamples = Math.ceil(frequency * pathSpan * samplesPerCycle);
  return Math.min(960, Math.max(baseSamples, frequencySamples));
}

function drawLineFieldLayer(
  ctx: CanvasRenderingContext2D,
  layer: SourceLayer,
  seed: number,
  drawWidth = SOURCE_SIZE,
  drawHeight = SOURCE_SIZE,
) {
  const sourceSeed = seed + (layer.seedOffset ?? 0);
  const count = Math.max(2, Math.round(layer.lineFieldCount));
  const spacing = Math.max(2, layer.lineFieldSpacing);
  const stroke = Math.max(0.5, layer.lineFieldStroke);
  const samples = lineFieldSampleCount(layer, drawWidth, drawHeight);
  const span = layer.lineFieldOrientation === 'vertical' ? drawWidth : drawHeight;
  const start = span / 2 - ((count - 1) * spacing) / 2;

  if (!layer.lineFieldTransparent) {
    ctx.save();
    ctx.fillStyle = layer.lineFieldBackground;
    ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(-drawWidth / 2, -drawHeight / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = stroke;

  for (let i = 0; i < count; i += 1) {
    const offset = start + i * spacing;
    const mix = count <= 1 ? 0 : i / (count - 1);
    ctx.strokeStyle = rgbToStyle(mixRgb(hexToRgb(layer.color), hexToRgb(layer.accentColor), mix * 0.55), 1);
    ctx.beginPath();
    for (let sample = 0; sample <= samples; sample += 1) {
      const t = sample / samples;
      const base = lineFieldBasePoint(layer.lineFieldOrientation, offset, t, drawWidth, drawHeight);
      const point = lineFieldPoint(layer, base.x, base.y, drawWidth, drawHeight, sourceSeed + i * 101);
      if (sample === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  ctx.restore();
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
  primitiveMaterial?: ResolvedMaterialConfig,
  primitiveMaterialTextures?: MaterialTextureCanvases | null,
  layout: 'document' | 'full-frame' = 'document',
): Promise<void> {
  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = (
    layer.blendMode === 'normal' ? 'source-over' : layer.blendMode
  ) as GlobalCompositeOperation;
  applySourceLayerTransform(ctx, width, height, layer, scale, layout);
  await drawSourceLayerContent(
    ctx,
    width,
    height,
    layer,
    seed,
    scale,
    draft,
    primitiveViewState,
    primitiveMaterial,
    primitiveMaterialTextures,
    layout,
  );
  ctx.restore();
}

function applySourceLayerTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: SourceLayer,
  scale: number,
  layout: 'document' | 'full-frame',
) {
  if (layout === 'full-frame') {
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    return;
  }
  ctx.translate(width * layer.x, height * layer.y);
  ctx.rotate(degToRad(layer.rotation));
  ctx.scale(scale * layer.scaleX, scale * layer.scaleY);
}

async function drawSourceLayerContent(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: SourceLayer,
  seed: number,
  scale: number,
  draft: boolean,
  primitiveViewState: PrimitiveViewportState | undefined,
  primitiveMaterial: ResolvedMaterialConfig | undefined,
  primitiveMaterialTextures: MaterialTextureCanvases | null | undefined,
  layout: 'document' | 'full-frame',
) {
  const { drawWidth, drawHeight } = sourceDrawSize(width, height, scale, layout);
  if (layer.kind === 'primitive') {
    const renderWidth = Math.min(Math.round(drawWidth * Math.max(scale, 1)), 1024);
    const renderHeight = Math.min(Math.round(drawHeight * Math.max(scale, 1)), 1024);
    const threeCanvas = await renderPrimitiveToCanvas(
      layer,
      { width: renderWidth, height: renderHeight },
      primitiveViewState,
      { forceFallback: draft },
      primitiveMaterial,
      primitiveMaterialTextures,
    );
    ctx.drawImage(threeCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    return;
  }
  if (layer.kind === 'noise') {
    await drawNoiseLayer(ctx, layer, seed + (layer.seedOffset ?? 0), draft, drawWidth, drawHeight);
    return;
  }
  if (layer.kind === 'lineField') {
    drawLineFieldLayer(ctx, layer, seed, drawWidth, drawHeight);
    return;
  }
  if (layer.kind === 'model') {
    const renderWidth = Math.min(Math.round(drawWidth * Math.max(scale, 1)), 1024);
    const renderHeight = Math.min(Math.round(drawHeight * Math.max(scale, 1)), 1024);
    const threeCanvas = await renderModelToCanvas(
      layer,
      { width: renderWidth, height: renderHeight },
      primitiveViewState,
      {
        forceFallback: draft,
      },
    );
    ctx.drawImage(threeCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    return;
  }
  drawArrayLayer(ctx, layer, seed);
}

function sourceDrawSize(width: number, height: number, scale: number, layout: 'document' | 'full-frame') {
  return {
    drawWidth: layout === 'full-frame' ? width / scale : SOURCE_SIZE,
    drawHeight: layout === 'full-frame' ? height / scale : SOURCE_SIZE,
  };
}
