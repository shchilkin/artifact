import type { GraphMaterialNode } from '../../nodeKinds';
import { createCanvas } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import { type GraphNodeRenderContext } from './context';

function applyMaterialPreviewNode(node: GraphMaterialNode, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.fillStyle = node.materialBaseColor;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = Math.min(0.22, 0.08 + node.materialClearcoat * 0.12);
  ctx.fillStyle = node.materialAccentColor;
  ctx.beginPath();
  ctx.ellipse(W * 0.3, H * 0.24, W * 0.18, H * 0.11, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  const lighting = ctx.createLinearGradient(0, 0, 0, H);
  lighting.addColorStop(0, 'rgba(255,255,255,0.1)');
  lighting.addColorStop(0.45, 'rgba(255,255,255,0)');
  lighting.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = lighting;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (node.materialGrain > 0 || node.materialRelief > 0) {
    const alpha = Math.min(0.28, (node.materialGrain + node.materialRelief) / 520);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = '#000000';
    for (let x = 0; x < W; x += 7) ctx.fillRect(x, 0, 1, H);
  }
  return canvas;
}

export async function renderMaterialGraphNode(node: GraphMaterialNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const materialNode = node;
  const albedoId = findIncomingSource(context.graph, nodeId, 'albedo');
  if (albedoId) return context.renderDependency(albedoId);
  return applyMaterialPreviewNode(materialNode, context.W, context.H);
}
