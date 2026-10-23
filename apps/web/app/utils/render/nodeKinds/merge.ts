import type { GraphMergeNode } from '../../nodeKinds';
import { cloneCanvas, createCanvas, toCompositeOperation } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import { type GraphNodeRenderContext, throwIfRenderAborted } from './context';

export async function renderMergeGraphNode(node: GraphMergeNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const mergeNode = node;
  const { graph, W, H, options, renderDependency } = context;
  const baseId = findIncomingSource(graph, nodeId, 'a');
  const overlayId = findIncomingSource(graph, nodeId, 'b');
  const canvas = baseId ? cloneCanvas(await renderDependency(baseId), W, H) : createCanvas(W, H);
  if (!overlayId) return canvas;
  const overlay = await renderDependency(overlayId);
  throwIfRenderAborted(options);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.save();
  ctx.globalCompositeOperation = toCompositeOperation(mergeNode.blendMode);
  ctx.globalAlpha = mergeNode.opacity / 100;
  ctx.drawImage(overlay, 0, 0);
  ctx.restore();
  return canvas;
}
