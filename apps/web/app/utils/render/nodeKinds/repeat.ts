import { lcg } from '../../lcg';
import type { GraphRepeatNode } from '../../nodeKinds';
import { measureAlphaBounds } from '../alphaBounds';
import { cloneCanvas, createCanvas, toCompositeOperation } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import { type GraphNodeRenderContext, hashString, throwIfRenderAborted } from './context';

function cropAlphaBounds(source: HTMLCanvasElement): HTMLCanvasElement {
  const bounds = measureAlphaBounds(source);
  if (!bounds) return source;

  const padding = 4;
  const sx = Math.max(0, bounds.minX - padding);
  const sy = Math.max(0, bounds.minY - padding);
  const sw = Math.min(source.width - sx, bounds.width + padding * 2);
  const sh = Math.min(source.height - sy, bounds.height + padding * 2);
  const crop = createCanvas(sw, sh);
  crop.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop;
}

function applyRepeatNode(
  source: HTMLCanvasElement,
  backdrop: HTMLCanvasElement | null,
  node: GraphRepeatNode,
  seed: number,
  W: number,
  H: number,
): HTMLCanvasElement {
  const canvas = backdrop ? cloneCanvas(backdrop, W, H) : createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const item = cropAlphaBounds(source);
  const params = repeatRenderParams(item, node, W);
  const rng = lcg((seed + (node.seedOffset ?? 0)) ^ hashString(node.id));
  const drawItem = (x: number, y: number, index: number, radialAngle = params.rotation) =>
    drawRepeatItem(ctx, item, node, params, rng, x, y, index, radialAngle);
  if (node.pattern === 'radial') drawRadialRepeat(node, params, W, H, drawItem);
  else drawGridRepeat(node, params, W, H, drawItem);
  return canvas;
}

type RepeatRng = ReturnType<typeof lcg>;

interface RepeatRenderParams {
  drawW: number;
  drawH: number;
  gap: number;
  radius: number;
  jitter: number;
  rotation: number;
  rotationStep: number;
  rotationJitter: number;
}

function repeatRenderParams(item: HTMLCanvasElement, node: GraphRepeatNode, W: number): RepeatRenderParams {
  const itemScale = Math.max(0.01, node.scale / 100);
  const unit = W / 540;
  return {
    drawW: Math.max(1, item.width * itemScale),
    drawH: Math.max(1, item.height * itemScale),
    gap: Math.max(1, node.gap * unit),
    radius: Math.max(0, node.radius * unit),
    jitter: Math.max(0, node.jitter * unit),
    rotation: (node.rotation * Math.PI) / 180,
    rotationStep: ((node.rotationStep ?? 0) * Math.PI) / 180 || 0,
    rotationJitter: ((node.rotationJitter ?? 0) * Math.PI) / 180 || 0,
  };
}

function drawRepeatItem(
  ctx: CanvasRenderingContext2D,
  item: HTMLCanvasElement,
  node: GraphRepeatNode,
  params: RepeatRenderParams,
  rng: RepeatRng,
  x: number,
  y: number,
  index: number,
  radialAngle: number,
) {
  const offsetX = params.jitter === 0 ? 0 : (rng() - 0.5) * params.jitter * 2;
  const offsetY = params.jitter === 0 ? 0 : (rng() - 0.5) * params.jitter * 2;
  ctx.save();
  ctx.translate(x + offsetX, y + offsetY);
  ctx.rotate(repeatItemAngle(node, params, rng, index, radialAngle));
  ctx.globalAlpha = node.opacity / 100;
  ctx.globalCompositeOperation = toCompositeOperation(node.blendMode);
  ctx.drawImage(item, -params.drawW / 2, -params.drawH / 2, params.drawW, params.drawH);
  ctx.restore();
}

function repeatItemAngle(
  node: GraphRepeatNode,
  params: RepeatRenderParams,
  rng: RepeatRng,
  index: number,
  radialAngle: number,
) {
  const jitterAngle = params.rotationJitter === 0 ? 0 : (rng() - 0.5) * params.rotationJitter * 2;
  const modeAngle = repeatModeAngle(node.rotationMode ?? 'fixed', params, rng, index, radialAngle);
  return modeAngle + jitterAngle;
}

function repeatModeAngle(
  mode: GraphRepeatNode['rotationMode'],
  params: RepeatRenderParams,
  rng: RepeatRng,
  index: number,
  radialAngle: number,
) {
  if (mode === 'radial') return radialAngle;
  if (mode === 'step') return params.rotation + index * params.rotationStep;
  if (mode === 'random') return params.rotation + (rng() - 0.5) * Math.PI * 2;
  return params.rotation;
}

function drawRadialRepeat(
  node: GraphRepeatNode,
  params: RepeatRenderParams,
  W: number,
  H: number,
  drawItem: (x: number, y: number, index: number, radialAngle: number) => void,
) {
  const count = Math.max(1, Math.round(node.count));
  const rings = Math.max(1, Math.round(node.rows));
  let index = 0;
  for (let ring = 0; ring < rings; ring += 1) {
    const r = params.radius + ring * params.gap;
    for (let i = 0; i < count; i += 1) {
      const angle = params.rotation + (i / count) * Math.PI * 2;
      drawItem(W / 2 + Math.cos(angle) * r, H / 2 + Math.sin(angle) * r, index, angle);
      index += 1;
    }
  }
}

function drawGridRepeat(
  node: GraphRepeatNode,
  params: RepeatRenderParams,
  W: number,
  H: number,
  drawItem: (x: number, y: number, index: number) => void,
) {
  const columns = Math.max(1, Math.round(node.count));
  const rows = Math.max(1, Math.round(node.rows));
  const stepX = Math.max(params.gap, params.drawW * 0.25);
  const stepY = Math.max(params.gap, params.drawH * 0.25);
  const totalW = (columns - 1) * stepX;
  const totalH = (rows - 1) * stepY;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      drawItem(W / 2 - totalW / 2 + col * stepX, H / 2 - totalH / 2 + row * stepY, row * columns + col);
    }
  }
}

export async function renderRepeatGraphNode(node: GraphRepeatNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const repeatNode = node;
  const { doc, graph, W, H, options, renderDependency } = context;
  const sourceId = findIncomingSource(graph, nodeId, 'in');
  const backdropId = findIncomingSource(graph, nodeId, 'bg');
  const source = sourceId ? await renderDependency(sourceId) : createCanvas(W, H);
  const backdrop = backdropId ? await renderDependency(backdropId) : null;
  throwIfRenderAborted(options);
  return applyRepeatNode(source, backdrop, repeatNode, doc.global.seed, W, H);
}
