import type { GraphTransformNode } from '../../nodeKinds';
import { alphaBoundsCenter, measureVisibleAlphaBounds } from '../alphaBounds';
import { createCanvas } from '../canvas';
import { type GraphNodeRenderContext, renderSingleInputSource } from './context';

function transformNodePivot(source: HTMLCanvasElement, node: GraphTransformNode, W: number, H: number) {
  if ((node.pivotMode ?? 'canvas') !== 'visible') return { x: W / 2, y: H / 2 };
  const bounds = measureVisibleAlphaBounds(source);
  return bounds ? alphaBoundsCenter(bounds) : { x: W / 2, y: H / 2 };
}

function applyTransformNode(source: HTMLCanvasElement, node: GraphTransformNode, W: number, H: number) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const pivot = transformNodePivot(source, node, W, H);
  const offsetX = (node.x / 100) * W;
  const offsetY = (node.y / 100) * H;
  const scaleX = Math.max(0.01, node.scaleX / 100);
  const scaleY = Math.max(0.01, node.scaleY / 100);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity / 100));
  ctx.translate(pivot.x + offsetX, pivot.y + offsetY);
  ctx.rotate((node.rotation * Math.PI) / 180);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(source, -pivot.x, -pivot.y, W, H);
  ctx.restore();
  return canvas;
}

export async function renderTransformGraphNode(node: GraphTransformNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const transformNode = node;
  const source = await renderSingleInputSource(nodeId, context);
  return applyTransformNode(source, transformNode, context.W, context.H);
}
