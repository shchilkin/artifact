import { lcg } from '../../lcg';
import type { GraphGrimeShadowNode } from '../../nodeKinds';
import { visibleAlphaThreshold } from '../alphaBounds';
import { createCanvas } from '../canvas';
import { type GraphNodeRenderContext, hashString, renderSingleInputSource } from './context';

function applyGrimeShadowNode(
  source: HTMLCanvasElement,
  node: GraphGrimeShadowNode,
  seed: number,
  W: number,
  H: number,
) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const silhouette = sourceAlphaSilhouette(source, node.color, W, H);
  const shadow = renderGrimeShadow(silhouette, node, seed, W, H);
  ctx.drawImage(shadow, 0, 0);
  if (!node.shadowOnly) ctx.drawImage(source, 0, 0);
  return canvas;
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

function renderGrimeShadow(
  silhouette: HTMLCanvasElement,
  node: GraphGrimeShadowNode,
  seed: number,
  W: number,
  H: number,
) {
  const shadow = createCanvas(W, H);
  const ctx = shadow.getContext('2d', { willReadFrequently: true });
  if (!ctx) return shadow;
  const unit = W / 540;
  const layers = Math.max(1, Math.round(node.layers));
  const spread = Math.max(0, node.spread * unit);
  const jitter = Math.max(0, node.jitter * unit);
  const rng = lcg((seed + (node.seedOffset ?? 0)) ^ hashString(node.id));

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < layers; i += 1) {
    const t = (i + 1) / layers;
    const x = node.x * unit * t + (jitter > 0 ? (rng() - 0.5) * jitter : 0);
    const y = node.y * unit * t + (jitter > 0 ? (rng() - 0.5) * jitter : 0);
    ctx.globalAlpha = (node.opacity / 100) * (1.15 - t * 0.55);
    ctx.filter = node.blur > 0 ? `blur(${node.blur * unit * t}px)` : 'none';
    drawSpreadSilhouette(ctx, silhouette, x, y, spread * t);
  }
  ctx.restore();

  if (node.grime > 0) applyShadowGrime(shadow, node, seed, W, H);
  return shadow;
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

function applyShadowGrime(canvas: HTMLCanvasElement, node: GraphGrimeShadowNode, seed: number, W: number, H: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, W, H);
  const amount = Math.max(0, Math.min(1, node.grime / 100));
  const baseSeed = (seed + (node.seedOffset ?? 0)) ^ hashString(node.id);
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

export async function renderGrimeShadowGraphNode(node: GraphGrimeShadowNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const grimeShadowNode = node;
  const source = await renderSingleInputSource(nodeId, context);
  return applyGrimeShadowNode(source, grimeShadowNode, context.doc.global.seed, context.W, context.H);
}
