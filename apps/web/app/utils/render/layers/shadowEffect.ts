/**
 * The shadow kernel: a stacked, optionally dirty shadow cast by the visible alpha of its input. It started as the
 * Grime Shadow graph node; its pixels are unchanged (the node's seed salt is the `shadowVariation` parameter).
 */
import type { KernelParamValues } from '../../../types/effectKernels';
import { lcg } from '../../lcg';
import { visibleAlphaThreshold } from '../alphaBounds';
import { cloneCanvas, createCanvas } from '../canvas';

interface ShadowSettings {
  x: number;
  y: number;
  layers: number;
  blur: number;
  spread: number;
  grime: number;
  jitter: number;
  opacity: number;
  /** Every layer at full opacity, instead of fading the outer layers. */
  flat: boolean;
  variation: number;
}

function sourceAlphaSilhouette(source: HTMLCanvasElement, color: string, W: number, H: number) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx || !sourceCtx) return canvas;
  const image = sourceCtx.getImageData(0, 0, W, H);
  const threshold = visibleAlphaThreshold(image.data);
  const rgb = parseCanvasColor(color);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    image.data[i] = rgb.r;
    image.data[i + 1] = rgb.g;
    image.data[i + 2] = rgb.b;
    image.data[i + 3] = alpha > threshold ? alpha : 0;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function renderShadow(silhouette: HTMLCanvasElement, shadow: ShadowSettings, seed: number, W: number, H: number) {
  const shadowCanvas = createCanvas(W, H);
  const ctx = shadowCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return shadowCanvas;
  const unit = W / 540;
  const layers = Math.max(1, Math.round(shadow.layers));
  const spread = Math.max(0, shadow.spread * unit);
  const jitter = Math.max(0, shadow.jitter * unit);
  const rng = lcg(seed ^ shadow.variation);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < layers; i += 1) {
    const t = (i + 1) / layers;
    const x = shadow.x * unit * t + (jitter > 0 ? (rng() - 0.5) * jitter : 0);
    const y = shadow.y * unit * t + (jitter > 0 ? (rng() - 0.5) * jitter : 0);
    ctx.globalAlpha = (shadow.opacity / 100) * (shadow.flat ? 1 : 1.15 - t * 0.55);
    ctx.filter = shadow.blur > 0 ? `blur(${shadow.blur * unit * t}px)` : 'none';
    drawSpreadSilhouette(ctx, silhouette, x, y, spread * t);
  }
  ctx.restore();

  if (shadow.grime > 0) applyShadowGrime(shadowCanvas, shadow, seed, W, H);
  return shadowCanvas;
}

function drawSpreadSilhouette(
  ctx: CanvasRenderingContext2D,
  silhouette: HTMLCanvasElement,
  x: number,
  y: number,
  spread: number,
) {
  if (spread <= 0) {
    ctx.drawImage(silhouette, x, y);
    return;
  }
  const steps = Math.max(4, Math.min(12, Math.round(spread / 3)));
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.drawImage(silhouette, x + Math.cos(angle) * spread, y + Math.sin(angle) * spread);
  }
  ctx.drawImage(silhouette, x, y);
}

function applyShadowGrime(canvas: HTMLCanvasElement, shadow: ShadowSettings, seed: number, W: number, H: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, W, H);
  const amount = Math.max(0, Math.min(1, shadow.grime / 100));
  const baseSeed = seed ^ shadow.variation;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4 + 3;
      if (image.data[i] === 0) continue;
      const fine = coordinateNoise(x >> 2, y >> 2, baseSeed);
      const coarse = coordinateNoise(x >> 5, y >> 5, baseSeed ^ 0x9e3779b9);
      const dirt = fine * 0.55 + coarse * 0.45;
      image.data[i] = Math.round(image.data[i] * (1 - amount * dirt * 0.82));
    }
  }
  ctx.putImageData(image, 0, 0);
}

function coordinateNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x ^ seed, 374761393) + Math.imul(y ^ (seed >>> 1), 668265263);
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function parseCanvasColor(color: string) {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    };
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex[1] + hex[1], 16),
      g: Number.parseInt(hex[2] + hex[2], 16),
      b: Number.parseInt(hex[3] + hex[3], 16),
    };
  }
  return { r: 9, g: 6, b: 6 };
}

/** Replaces the canvas with the shadow of its content, under the content unless the source is hidden. */
export function applyShadowEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: KernelParamValues,
  seed: number,
) {
  if (params.shadowOpacity <= 0) return;
  const shadow: ShadowSettings = {
    x: params.shadowX,
    y: params.shadowY,
    layers: params.shadowLayers,
    blur: params.shadowBlur,
    spread: params.shadowSpread,
    grime: params.shadowGrime,
    jitter: params.shadowJitter,
    opacity: params.shadowOpacity,
    flat: params.shadowFalloff === 'flat',
    variation: params.shadowVariation >>> 0,
  };
  const source = cloneCanvas(ctx.canvas as HTMLCanvasElement, W, H);
  const silhouette = sourceAlphaSilhouette(source, params.shadowColor, W, H);
  const cast = renderShadow(silhouette, shadow, seed, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(cast, 0, 0);
  if (params.shadowSource !== 'hide') ctx.drawImage(source, 0, 0);
  ctx.restore();
}
