import type { GraphShaderNode } from '../../nodeKinds';
import { cloneCanvas, createCanvas, toCompositeOperation } from '../canvas';
import { renderCustomCodeShaderNodeToCanvas } from '../customCodeShader';
import { findIncomingSource } from '../graphInputs';
import { renderShaderNodeToCanvas } from '../shaderNodes';
import { type GraphNodeRenderContext, throwIfRenderAborted } from './context';

function byteClamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function unitClamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pixelLuma(r: number, g: number, b: number) {
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
}

function imageIndex(width: number, height: number, x: number, y: number) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  return (py * width + px) * 4;
}

function pixelLumaAt(image: ImageData, width: number, height: number, x: number, y: number) {
  const index = imageIndex(width, height, x, y);
  return pixelLuma(image.data[index] ?? 0, image.data[index + 1] ?? 0, image.data[index + 2] ?? 0);
}

function shaderLumaAt(shaderImage: ImageData, width: number, height: number, x: number, y: number) {
  return pixelLumaAt(shaderImage, width, height, x, y);
}

function createBackdropAwareShaderCanvas(
  backdrop: HTMLCanvasElement,
  shader: HTMLCanvasElement,
  shaderNode: GraphShaderNode,
  W: number,
  H: number,
): HTMLCanvasElement {
  const sourceCanvas = cloneCanvas(backdrop, W, H);
  const shaderCanvas = cloneCanvas(shader, W, H);
  const output = createCanvas(W, H);
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const shaderCtx = shaderCanvas.getContext('2d', { willReadFrequently: true })!;
  const outputCtx = output.getContext('2d', { willReadFrequently: true })!;
  const sourceImage = sourceCtx.getImageData(0, 0, W, H);
  const shaderImage = shaderCtx.getImageData(0, 0, W, H);
  const outputImage = outputCtx.createImageData(W, H);
  const distortionStrength = unitClamp(shaderNode.distortion / 100);
  const displacement = Math.max(1, Math.min(W, H) * (0.006 + distortionStrength * 0.048));
  const causticStrength = 0.16 + distortionStrength * 0.34;
  const tintBase = 0.035 + distortionStrength * 0.085;

  for (let index = 0; index < outputImage.data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % W;
    const y = Math.floor(pixel / W);
    const hr = shaderImage.data[index] ?? 0;
    const hg = shaderImage.data[index + 1] ?? 0;
    const hb = shaderImage.data[index + 2] ?? 0;
    const shaderLuma = pixelLuma(hr, hg, hb);
    const dx = shaderLumaAt(shaderImage, W, H, x + 1, y) - shaderLumaAt(shaderImage, W, H, x - 1, y);
    const dy = shaderLumaAt(shaderImage, W, H, x, y + 1) - shaderLumaAt(shaderImage, W, H, x, y - 1);
    const sourceIndex = imageIndex(W, H, x + dx * displacement, y + dy * displacement);
    const sr = sourceImage.data[sourceIndex] ?? 0;
    const sg = sourceImage.data[sourceIndex + 1] ?? 0;
    const sb = sourceImage.data[sourceIndex + 2] ?? 0;
    const sa = sourceImage.data[sourceIndex + 3] ?? 0;
    const sourceDx = pixelLumaAt(sourceImage, W, H, x + 1, y) - pixelLumaAt(sourceImage, W, H, x - 1, y);
    const sourceDy = pixelLumaAt(sourceImage, W, H, x, y + 1) - pixelLumaAt(sourceImage, W, H, x, y - 1);
    const sourceEdge = unitClamp(Math.abs(sourceDx) + Math.abs(sourceDy));

    const edge = unitClamp(Math.abs(dx) + Math.abs(dy));
    const caustic =
      (shaderLuma - 0.5) * causticStrength + edge * (0.18 + distortionStrength * 0.28) + sourceEdge * 0.08;
    const tint = unitClamp(tintBase + edge * 0.12) * 0.68;

    outputImage.data[index] = byteClamp(sr * (1 - tint) + hr * tint + caustic * 255);
    outputImage.data[index + 1] = byteClamp(sg * (1 - tint) + hg * tint + caustic * 255);
    outputImage.data[index + 2] = byteClamp(sb * (1 - tint) + hb * tint + caustic * 255);
    outputImage.data[index + 3] = sa;
  }

  outputCtx.putImageData(outputImage, 0, 0);
  return output;
}

function mixShaderPassWithBackdrop(
  backdrop: HTMLCanvasElement,
  processedBackdrop: HTMLCanvasElement,
  strengthPercent: number,
  blendMode: GraphShaderNode['blendMode'],
  W: number,
  H: number,
) {
  const strength = Math.max(0, Math.min(1, strengthPercent / 100));
  if (strength <= 0.001) return cloneCanvas(backdrop, W, H);

  const canvas = cloneCanvas(backdrop, W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = toCompositeOperation(blendMode);
  ctx.drawImage(processedBackdrop, 0, 0, W, H);
  ctx.restore();
  return canvas;
}

export async function renderShaderGraphNode(node: GraphShaderNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const shaderNode = node;
  const backdropId = findIncomingSource(context.graph, nodeId, 'bg');
  if (shaderNode.shaderKind === 'customCode' || shaderNode.shaderKind === 'aiShader') {
    const backdrop = shaderNode.role === 'effect' && backdropId ? await context.renderDependency(backdropId) : null;
    throwIfRenderAborted(context.options);
    const rendered = renderCustomCodeShaderNodeToCanvas(
      shaderNode,
      context.doc.global.seed,
      context.W,
      context.H,
      backdrop,
    );
    return shaderNode.role === 'effect' && backdrop
      ? mixShaderPassWithBackdrop(backdrop, rendered, shaderNode.opacity, shaderNode.blendMode, context.W, context.H)
      : rendered;
  }

  const shader = renderShaderNodeToCanvas(shaderNode, context.doc.global.seed, context.W, context.H);
  if (shaderNode.role === 'fill') return shader;
  if (!backdropId) return createCanvas(context.W, context.H);
  const backdrop = await context.renderDependency(backdropId);
  throwIfRenderAborted(context.options);
  const processedBackdrop = createBackdropAwareShaderCanvas(backdrop, shader, shaderNode, context.W, context.H);
  return mixShaderPassWithBackdrop(
    backdrop,
    processedBackdrop,
    shaderNode.opacity,
    shaderNode.blendMode,
    context.W,
    context.H,
  );
}
