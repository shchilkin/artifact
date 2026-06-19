import type {
  CanvasDocument,
  CanvasGraph,
  EffectLayer,
  GraphColorNode,
  GraphEnvironmentNode,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMaterialNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphScene3DNode,
  GraphTransformNode,
  Layer,
  MaterialTextureInputPort,
  ModelLayer,
  PrimitiveLayer,
} from '../../types/config';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../types/config';
import { lcg } from '../lcg';
import { renderModelSceneToCanvas, type SceneMaterialTextureCanvases } from '../modelRenderer';
import { EXPORT_NODE_ID } from '../nodeGraph';
import { alphaBoundsCenter, measureAlphaBounds, measureVisibleAlphaBounds, visibleAlphaThreshold } from './alphaBounds';
import { cloneCanvas, createCanvas, drawBackground, toCompositeOperation } from './canvas';
import { applyGpuOnlyEffectLayerChain, applyLayerToCanvas, isGpuOnlyEffectLayer, type RenderOptions } from './layers';

const GRAPH_RENDER_CACHE_LIMIT = 160;
const ENVIRONMENT_RENDER_MAX = 1024;

export interface GraphRenderCache {
  namespace: string;
  entries: Map<string, Promise<HTMLCanvasElement>>;
  entryKey?: (nodeId: string) => string | null;
  limit?: number;
}

function findIncomingSource(
  graph: CanvasGraph,
  toId: string,
  toPort: CanvasGraph['edges'][number]['toPort'],
): string | null {
  const edge = graph.edges.find((item) => item.toId === toId && item.toPort === toPort);
  return edge?.fromId ?? null;
}

function findMergeNode(graph: CanvasGraph, nodeId: string): GraphMergeNode | undefined {
  return graph.mergeNodes.find((node) => node.id === nodeId);
}

function findColorNode(graph: CanvasGraph, nodeId: string): GraphColorNode | undefined {
  return (graph.colorNodes ?? []).find((node) => node.id === nodeId);
}

function findRepeatNode(graph: CanvasGraph, nodeId: string): GraphRepeatNode | undefined {
  return (graph.repeatNodes ?? []).find((node) => node.id === nodeId);
}

function findMaterialNode(graph: CanvasGraph, nodeId: string): GraphMaterialNode | undefined {
  return (graph.materialNodes ?? []).find((node) => node.id === nodeId);
}

function findMaskNode(graph: CanvasGraph, nodeId: string): GraphMaskNode | undefined {
  return (graph.maskNodes ?? []).find((node) => node.id === nodeId);
}

function findTransformNode(graph: CanvasGraph, nodeId: string): GraphTransformNode | undefined {
  return (graph.transformNodes ?? []).find((node) => node.id === nodeId);
}

function findGrimeShadowNode(graph: CanvasGraph, nodeId: string): GraphGrimeShadowNode | undefined {
  return (graph.grimeShadowNodes ?? []).find((node) => node.id === nodeId);
}

function findScene3DNode(graph: CanvasGraph, nodeId: string): GraphScene3DNode | undefined {
  return (graph.scene3dNodes ?? []).find((node) => node.id === nodeId);
}

function findEnvironmentNode(graph: CanvasGraph, nodeId: string): GraphEnvironmentNode | undefined {
  return (graph.environmentNodes ?? []).find((node) => node.id === nodeId);
}

function findLayer(doc: CanvasDocument, nodeId: string): Layer | undefined {
  return doc.layers.find((layer) => layer.id === nodeId);
}

type Scene3DSourceLayer = ModelLayer | PrimitiveLayer;

function findScene3DSourceLayer(doc: CanvasDocument, nodeId: string | null): Scene3DSourceLayer | null {
  if (!nodeId) return null;
  const layer = findLayer(doc, nodeId);
  return layer?.kind === 'model' || layer?.kind === 'primitive' ? layer : null;
}

interface GpuEffectChain {
  baseSourceId: string | null;
  layers: EffectLayer[];
}

function collectGpuOnlyEffectChain(doc: CanvasDocument, graph: CanvasGraph, nodeId: string): GpuEffectChain | null {
  const layers: EffectLayer[] = [];
  let currentId: string | null = nodeId;
  let baseSourceId: string | null = null;

  while (currentId) {
    const layer = findLayer(doc, currentId);
    if (!layer || layer.kind !== 'effect' || !isGpuOnlyEffectLayer(layer)) {
      baseSourceId = currentId;
      break;
    }

    layers.unshift(layer);
    const sourceId = findIncomingSource(graph, currentId, 'in');
    if (!sourceId) {
      baseSourceId = null;
      break;
    }
    currentId = sourceId;
  }

  return layers.length > 1 ? { baseSourceId, layers } : null;
}

function throwIfRenderAborted(options: RenderOptions): void {
  if (!options.signal?.aborted) return;
  const error = new Error('Render aborted');
  error.name = 'AbortError';
  throw error;
}

function withGraphPrimitiveViewStates(doc: CanvasDocument, graph: CanvasGraph, options: RenderOptions): RenderOptions {
  const primitiveViewStates = {
    ...(doc.graph?.primitiveViewStates ?? {}),
    ...(graph.primitiveViewStates ?? {}),
    ...(options.primitiveViewStates ?? {}),
  };
  if (Object.keys(primitiveViewStates).length === 0) return options;
  return { ...options, primitiveViewStates };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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

function transformNodePivot(source: HTMLCanvasElement, node: GraphTransformNode, W: number, H: number) {
  if ((node.pivotMode ?? 'canvas') !== 'visible') return { x: W / 2, y: H / 2 };
  const bounds = measureVisibleAlphaBounds(source);
  return bounds ? alphaBoundsCenter(bounds) : { x: W / 2, y: H / 2 };
}

function applyColorNode(source: HTMLCanvasElement, node: GraphColorNode, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);

  const { contrast, brightness, saturation, hue } = node;
  if (contrast === 100 && brightness === 100 && saturation === 100 && hue === 0) return canvas;

  const imageData = ctx.getImageData(0, 0, W, H);
  const d = imageData.data;

  const bF = brightness / 100;
  const cF = contrast / 100;
  const sF = saturation / 100;

  const hRad = (hue * Math.PI) / 180;
  const cos = Math.cos(hRad);
  const sin = Math.sin(hRad);
  const hr00 = 0.213 + cos * 0.787 - sin * 0.213;
  const hr01 = 0.715 - cos * 0.715 - sin * 0.715;
  const hr02 = 0.072 - cos * 0.072 + sin * 0.928;
  const hr10 = 0.213 - cos * 0.213 + sin * 0.143;
  const hr11 = 0.715 + cos * 0.285 + sin * 0.14;
  const hr12 = 0.072 - cos * 0.072 - sin * 0.283;
  const hr20 = 0.213 - cos * 0.213 - sin * 0.787;
  const hr21 = 0.715 - cos * 0.715 + sin * 0.715;
  const hr22 = 0.072 + cos * 0.928 + sin * 0.072;

  const sm00 = 0.213 + 0.787 * sF;
  const sm01 = 0.715 - 0.715 * sF;
  const sm02 = 0.072 - 0.072 * sF;
  const sm10 = 0.213 - 0.213 * sF;
  const sm11 = 0.715 + 0.285 * sF;
  const sm12 = 0.072 - 0.072 * sF;
  const sm20 = 0.213 - 0.213 * sF;
  const sm21 = 0.715 - 0.715 * sF;
  const sm22 = 0.072 + 0.928 * sF;

  const applyHue = hue !== 0;
  const applySat = saturation !== 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    r *= bF;
    g *= bF;
    b *= bF;

    r = (r - 0.5) * cF + 0.5;
    g = (g - 0.5) * cF + 0.5;
    b = (b - 0.5) * cF + 0.5;

    if (applySat) {
      const nr = sm00 * r + sm01 * g + sm02 * b;
      const ng = sm10 * r + sm11 * g + sm12 * b;
      const nb = sm20 * r + sm21 * g + sm22 * b;
      r = nr;
      g = ng;
      b = nb;
    }

    if (applyHue) {
      const nr = hr00 * r + hr01 * g + hr02 * b;
      const ng = hr10 * r + hr11 * g + hr12 * b;
      const nb = hr20 * r + hr21 * g + hr22 * b;
      r = nr;
      g = ng;
      b = nb;
    }

    d[i] = Math.min(255, Math.max(0, Math.round(r * 255)));
    d[i + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
    d[i + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
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

function applyMaterialPreviewNode(node: GraphMaterialNode, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, node.materialAccentColor);
  gradient.addColorStop(0.42, node.materialBaseColor);
  gradient.addColorStop(0.68, node.materialAccentColor);
  gradient.addColorStop(1, node.materialBaseColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
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

type RenderDependency = (dependencyId: string, size?: { width: number; height: number }) => Promise<HTMLCanvasElement>;

interface GraphNodeRenderContext {
  doc: CanvasDocument;
  graph: CanvasGraph;
  W: number;
  H: number;
  imageCache: Map<string, HTMLImageElement>;
  options: RenderOptions;
  renderDependency: RenderDependency;
}

type GraphNodeRenderer = (nodeId: string, context: GraphNodeRenderContext) => Promise<HTMLCanvasElement | null>;

async function renderExportGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  if (nodeId !== EXPORT_NODE_ID) return null;
  const { doc, graph, W, H, options, renderDependency } = context;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (options.outputBackground === 'document') drawBackground(ctx, W, H, doc.global.bg);
  const sourceId = findIncomingSource(graph, nodeId, 'in');
  if (!sourceId) return canvas;
  const rendered = await renderDependency(sourceId);
  throwIfRenderAborted(options);
  ctx.drawImage(rendered, 0, 0);
  return canvas;
}

async function renderMergeGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const mergeNode = findMergeNode(context.graph, nodeId);
  if (!mergeNode) return null;
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

async function renderColorGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const colorNode = findColorNode(context.graph, nodeId);
  if (!colorNode) return null;
  const source = await renderSingleInputSource(nodeId, context);
  return applyColorNode(source, colorNode, context.W, context.H);
}

async function renderRepeatGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const repeatNode = findRepeatNode(context.graph, nodeId);
  if (!repeatNode) return null;
  const { doc, graph, W, H, options, renderDependency } = context;
  const sourceId = findIncomingSource(graph, nodeId, 'in');
  const backdropId = findIncomingSource(graph, nodeId, 'bg');
  const source = sourceId ? await renderDependency(sourceId) : createCanvas(W, H);
  const backdrop = backdropId ? await renderDependency(backdropId) : null;
  throwIfRenderAborted(options);
  return applyRepeatNode(source, backdrop, repeatNode, doc.global.seed, W, H);
}

async function renderMaterialGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const materialNode = findMaterialNode(context.graph, nodeId);
  if (!materialNode) return null;
  const albedoId = findIncomingSource(context.graph, nodeId, 'albedo');
  if (albedoId) return context.renderDependency(albedoId);
  return applyMaterialPreviewNode(materialNode, context.W, context.H);
}

async function renderMaskGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const maskNode = findMaskNode(context.graph, nodeId);
  if (!maskNode) return null;
  const { graph, W, H, renderDependency } = context;
  const sourceId = findIncomingSource(graph, nodeId, 'in');
  const maskId = findIncomingSource(graph, nodeId, 'mask');
  const source = sourceId ? await renderDependency(sourceId) : createCanvas(W, H);
  if (!maskId) return source;
  const mask = await renderDependency(maskId);
  throwIfRenderAborted(context.options);
  return applyMaskNode(source, mask, maskNode, W, H);
}

async function renderTransformGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const transformNode = findTransformNode(context.graph, nodeId);
  if (!transformNode) return null;
  const source = await renderSingleInputSource(nodeId, context);
  return applyTransformNode(source, transformNode, context.W, context.H);
}

async function renderGrimeShadowGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const grimeShadowNode = findGrimeShadowNode(context.graph, nodeId);
  if (!grimeShadowNode) return null;
  const source = await renderSingleInputSource(nodeId, context);
  return applyGrimeShadowNode(source, grimeShadowNode, context.doc.global.seed, context.W, context.H);
}

async function renderScene3DGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const sceneNode = findScene3DNode(context.graph, nodeId);
  if (!sceneNode) return null;
  const { doc, graph, W, H, options, renderDependency } = context;
  const modelLayer = findScene3DSourceLayer(doc, findIncomingSource(graph, nodeId, 'model'));
  const materialId = findIncomingSource(graph, nodeId, 'material');
  const environmentId = findIncomingSource(graph, nodeId, 'env');
  const backdropId = findIncomingSource(graph, nodeId, 'bg');
  const materialNode = materialId ? findMaterialNode(graph, materialId) : undefined;
  const materialTextures = materialId ? await resolveMaterialTextureCanvases(materialId, context) : null;
  const environmentNode = environmentId ? findEnvironmentNode(graph, environmentId) : undefined;
  const environmentNodeSourceId = environmentId ? findIncomingSource(graph, environmentId, 'in') : null;
  const environmentCanvas =
    environmentId && (!environmentNode || environmentNodeSourceId) ? await renderDependency(environmentId) : null;
  const backdropCanvas = backdropId ? await renderDependency(backdropId) : null;
  throwIfRenderAborted(options);
  if (!modelLayer) {
    const fallback = backdropCanvas ? cloneCanvas(backdropCanvas, W, H) : createCanvas(W, H);
    return fallback;
  }
  return renderModelSceneToCanvas(
    modelLayer,
    sceneNode,
    { width: W, height: H },
    options.primitiveViewStates?.[sceneNode.id],
    {
      forceFallback: options.draft,
      materialConfig: materialNode,
      materialTextures,
      environmentCanvas,
      environmentSource: environmentNode?.environmentSrc ?? null,
      backdropCanvas,
    },
  );
}

async function resolveMaterialTextureCanvases(
  materialId: string,
  context: GraphNodeRenderContext,
): Promise<SceneMaterialTextureCanvases | null> {
  const textures: SceneMaterialTextureCanvases = {};
  let hasTexture = false;
  for (const port of MATERIAL_TEXTURE_INPUT_PORTS) {
    const sourceId = findIncomingSource(context.graph, materialId, port);
    if (!sourceId) continue;
    textures[materialTextureKey(port)] = await context.renderDependency(sourceId);
    hasTexture = true;
  }
  return hasTexture ? textures : null;
}

function materialTextureKey(port: MaterialTextureInputPort): keyof SceneMaterialTextureCanvases {
  return port;
}

async function renderEnvironmentGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  if (!findEnvironmentNode(context.graph, nodeId)) return null;
  const sourceId = findIncomingSource(context.graph, nodeId, 'in');
  if (!sourceId) return createCanvas(context.W, context.H);
  return context.renderDependency(sourceId, environmentRenderSize(context.W, context.H));
}

function environmentRenderSize(width: number, height: number) {
  const requestedWidth = Math.max(2, width);
  const widthFromHeight = Math.max(2, height * 2);
  const envWidth = Math.min(ENVIRONMENT_RENDER_MAX, Math.max(requestedWidth, widthFromHeight));
  const evenWidth = Math.max(2, Math.round(envWidth / 2) * 2);
  return { width: evenWidth, height: Math.max(1, Math.round(evenWidth / 2)) };
}

async function renderSingleInputSource(nodeId: string, context: GraphNodeRenderContext) {
  const sourceId = findIncomingSource(context.graph, nodeId, 'in');
  const source = sourceId ? await context.renderDependency(sourceId) : createCanvas(context.W, context.H);
  throwIfRenderAborted(context.options);
  return source;
}

async function renderGpuOnlyLayerChain(
  nodeId: string,
  layer: Layer,
  context: GraphNodeRenderContext,
): Promise<HTMLCanvasElement | null> {
  const { doc, graph, W, H, options, renderDependency } = context;
  if (layer.kind !== 'effect' || options.skipEffects || options.effectResolution) return null;
  const gpuEffectChain = collectGpuOnlyEffectChain(doc, graph, nodeId);
  if (!gpuEffectChain) return null;
  const base = gpuEffectChain.baseSourceId ? await renderDependency(gpuEffectChain.baseSourceId) : createCanvas(W, H);
  throwIfRenderAborted(options);
  return applyGpuOnlyEffectLayerChain(base, gpuEffectChain.layers, doc, W, H, options);
}

function graphLayerInputPort(layer: Layer): 'in' | 'bg' {
  return layer.kind === 'effect' ? 'in' : 'bg';
}

function graphLayerRenderOptions(layer: Layer, options: RenderOptions): RenderOptions {
  return layer.kind === 'primitive' ||
    layer.kind === 'noise' ||
    layer.kind === 'array' ||
    layer.kind === 'lineField' ||
    layer.kind === 'model'
    ? { ...options, sourceLayout: 'full-frame' as const }
    : options;
}

async function primitiveLayerRenderOptions(layer: Layer, context: GraphNodeRenderContext): Promise<RenderOptions> {
  const { graph, options } = context;
  if (layer.kind !== 'primitive') return graphLayerRenderOptions(layer, options);
  const materialId = findIncomingSource(graph, layer.id, 'material');
  const material = materialId ? findMaterialNode(graph, materialId) : undefined;
  const materialTextures = materialId ? await resolveMaterialTextureCanvases(materialId, context) : null;
  const primitiveMaterials = material
    ? { ...(options.primitiveMaterials ?? {}), [layer.id]: material }
    : options.primitiveMaterials;
  const primitiveMaterialTextures = materialTextures
    ? { ...(options.primitiveMaterialTextures ?? {}), [layer.id]: materialTextures }
    : options.primitiveMaterialTextures;
  return { ...graphLayerRenderOptions(layer, options), primitiveMaterials, primitiveMaterialTextures };
}

async function renderLayerGraphNode(nodeId: string, context: GraphNodeRenderContext) {
  const { doc, graph, W, H, imageCache, options, renderDependency } = context;
  const layer = findLayer(doc, nodeId);
  if (!layer) return createCanvas(W, H);
  const gpuChain = await renderGpuOnlyLayerChain(nodeId, layer, context);
  if (gpuChain) return gpuChain;
  const sourceId = findIncomingSource(graph, nodeId, graphLayerInputPort(layer));
  const base = sourceId ? await renderDependency(sourceId) : createCanvas(W, H);
  throwIfRenderAborted(options);
  return applyLayerToCanvas(base, layer, doc, W, H, imageCache, await primitiveLayerRenderOptions(layer, context));
}

const GRAPH_NODE_RENDERERS: GraphNodeRenderer[] = [
  renderExportGraphNode,
  renderMergeGraphNode,
  renderColorGraphNode,
  renderRepeatGraphNode,
  renderMaterialGraphNode,
  renderMaskGraphNode,
  renderTransformGraphNode,
  renderGrimeShadowGraphNode,
  renderEnvironmentGraphNode,
  renderScene3DGraphNode,
];

async function renderGraphNodeUncached(nodeId: string, context: GraphNodeRenderContext) {
  throwIfRenderAborted(context.options);
  for (const renderNode of GRAPH_NODE_RENDERERS) {
    const canvas = await renderNode(nodeId, context);
    if (canvas) return canvas;
  }
  return renderLayerGraphNode(nodeId, context);
}

function pruneGraphRenderCache(
  cache: Map<string, Promise<HTMLCanvasElement>>,
  cacheNamespace: string | null,
  cacheLimit: number,
) {
  while (cacheNamespace && cache.size > cacheLimit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

async function renderGraphNode(
  doc: CanvasDocument,
  graph: CanvasGraph,
  nodeId: string,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
  cache: Map<string, Promise<HTMLCanvasElement>>,
  cacheNamespace: string | null,
  cacheEntryKey: ((nodeId: string) => string | null) | null,
  cacheLimit: number,
  rootSize: { width: number; height: number } = { width: W, height: H },
): Promise<HTMLCanvasElement> {
  throwIfRenderAborted(options);
  const nodeCacheKey = cacheEntryKey?.(nodeId) ?? nodeId;
  const sizedNodeCacheKey = W === rootSize.width && H === rootSize.height ? nodeCacheKey : `${nodeCacheKey}@${W}x${H}`;
  const cacheKey = cacheNamespace ? `${cacheNamespace}:${sizedNodeCacheKey}` : sizedNodeCacheKey;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const renderDependency = (dependencyId: string, size?: { width: number; height: number }) =>
    renderGraphNode(
      doc,
      graph,
      dependencyId,
      size?.width ?? W,
      size?.height ?? H,
      imageCache,
      options,
      cache,
      cacheNamespace,
      cacheEntryKey,
      cacheLimit,
      rootSize,
    );
  const renderPromise = renderGraphNodeUncached(nodeId, {
    doc,
    graph,
    W,
    H,
    imageCache,
    options,
    renderDependency,
  });

  cache.set(cacheKey, renderPromise);
  renderPromise.catch(() => {
    if (cache.get(cacheKey) === renderPromise) cache.delete(cacheKey);
  });
  pruneGraphRenderCache(cache, cacheNamespace, cacheLimit);
  return renderPromise;
}

export async function renderGraphTarget(
  doc: CanvasDocument,
  graph: CanvasGraph,
  targetNodeId: string,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions = {},
  renderCache?: GraphRenderCache,
): Promise<HTMLCanvasElement> {
  const cache = renderCache?.entries ?? new Map<string, Promise<HTMLCanvasElement>>();
  const renderOptions = withGraphPrimitiveViewStates(doc, graph, options);
  return renderGraphNode(
    doc,
    graph,
    targetNodeId,
    W,
    H,
    imageCache,
    renderOptions,
    cache,
    renderCache?.namespace ?? null,
    renderCache?.entryKey ?? null,
    renderCache?.limit ?? GRAPH_RENDER_CACHE_LIMIT,
    { width: W, height: H },
  );
}
