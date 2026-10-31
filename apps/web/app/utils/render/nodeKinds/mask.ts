import type { GraphMaskNode } from '../../nodeKinds';
import { cloneCanvas, createCanvas } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import { type GraphNodeRenderContext, throwIfRenderAborted } from './context';

function preparedMaskCanvas(mask: HTMLCanvasElement, node: GraphMaskNode, W: number, H: number): HTMLCanvasElement {
  const prepared = createCanvas(W, H);
  const ctx = prepared.getContext('2d', { willReadFrequently: true })!;
  const expand = Math.max(0, Math.round(node.expand));
  const feather = Math.max(0, node.feather);
  ctx.save();
  if (feather > 0) ctx.filter = `blur(${feather}px)`;
  if (expand > 0) {
    for (let y = -expand; y <= expand; y += expand) {
      for (let x = -expand; x <= expand; x += expand) {
        ctx.drawImage(mask, x, y, W, H);
      }
    }
  }
  ctx.drawImage(mask, 0, 0, W, H);
  ctx.restore();
  return prepared;
}

function maskAlphaForPixel(data: Uint8ClampedArray, index: number, node: GraphMaskNode) {
  const alpha = data[index + 3] / 255;
  const luma = (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
  let value = node.mode === 'alpha' ? alpha : luma;
  if (node.mode === 'threshold') value = luma >= node.threshold / 100 ? 1 : 0;
  if (node.invert) value = 1 - value;
  return Math.max(0, Math.min(1, value * (node.opacity / 100)));
}

function applyMaskNode(source: HTMLCanvasElement, mask: HTMLCanvasElement, node: GraphMaskNode, W: number, H: number) {
  const canvas = cloneCanvas(source, W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const prepared = preparedMaskCanvas(mask, node, W, H);
  const maskData = prepared.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const image = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i + 3] = Math.round(image.data[i + 3] * maskAlphaForPixel(maskData, i, node));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export async function renderMaskGraphNode(node: GraphMaskNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const maskNode = node;
  const { graph, W, H, renderDependency } = context;
  const sourceId = findIncomingSource(graph, nodeId, 'in');
  const maskId = findIncomingSource(graph, nodeId, 'mask');
  const source = sourceId ? await renderDependency(sourceId) : createCanvas(W, H);
  if (!maskId) return source;
  const mask = await renderDependency(maskId);
  throwIfRenderAborted(context.options);
  return applyMaskNode(source, mask, maskNode, W, H);
}
