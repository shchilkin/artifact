import type {
  CanvasDocument,
  CanvasGraph,
  GraphColorNode,
  GraphMergeNode,
  GraphRepeatNode,
  Layer,
} from '../../types/config';
import { lcg } from '../lcg';
import { EXPORT_NODE_ID } from '../nodeGraph';
import { cloneCanvas, createCanvas, drawBackground, toCompositeOperation } from './canvas';
import { applyLayerToCanvas, type RenderOptions } from './layers';

function findIncomingSource(graph: CanvasGraph, toId: string, toPort: 'in' | 'bg' | 'a' | 'b'): string | null {
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

function findLayer(doc: CanvasDocument, nodeId: string): Layer | undefined {
  return doc.layers.find((layer) => layer.id === nodeId);
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
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return source;
  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const alpha = pixels[(y * source.width + x) * 4 + 3] ?? 0;
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return source;

  const padding = 4;
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(source.width - sx, maxX - minX + 1 + padding * 2);
  const sh = Math.min(source.height - sy, maxY - minY + 1 + padding * 2);
  const crop = createCanvas(sw, sh);
  crop.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop;
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
  const itemScale = Math.max(0.01, node.scale / 100);
  const drawW = Math.max(1, item.width * itemScale);
  const drawH = Math.max(1, item.height * itemScale);
  const unit = W / 540;
  const gap = Math.max(1, node.gap * unit);
  const radius = Math.max(0, node.radius * unit);
  const jitter = Math.max(0, node.jitter * unit);
  const rotation = (node.rotation * Math.PI) / 180;
  const rng = lcg((seed + (node.seedOffset ?? 0)) ^ hashString(node.id));

  const drawItem = (x: number, y: number, angle = rotation) => {
    const offsetX = jitter === 0 ? 0 : (rng() - 0.5) * jitter * 2;
    const offsetY = jitter === 0 ? 0 : (rng() - 0.5) * jitter * 2;
    ctx.save();
    ctx.translate(x + offsetX, y + offsetY);
    ctx.rotate(angle);
    ctx.globalAlpha = node.opacity / 100;
    ctx.globalCompositeOperation = toCompositeOperation(node.blendMode);
    ctx.drawImage(item, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  };

  if (node.pattern === 'radial') {
    const count = Math.max(1, Math.round(node.count));
    const rings = Math.max(1, Math.round(node.rows));
    for (let ring = 0; ring < rings; ring += 1) {
      const r = radius + ring * gap;
      for (let i = 0; i < count; i += 1) {
        const angle = rotation + (i / count) * Math.PI * 2;
        drawItem(W / 2 + Math.cos(angle) * r, H / 2 + Math.sin(angle) * r, angle);
      }
    }
    return canvas;
  }

  const columns = Math.max(1, Math.round(node.count));
  const rows = Math.max(1, Math.round(node.rows));
  const stepX = Math.max(gap, drawW * 0.25);
  const stepY = Math.max(gap, drawH * 0.25);
  const totalW = (columns - 1) * stepX;
  const totalH = (rows - 1) * stepY;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = W / 2 - totalW / 2 + col * stepX;
      const y = H / 2 - totalH / 2 + row * stepY;
      drawItem(x, y);
    }
  }

  return canvas;
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
): Promise<HTMLCanvasElement> {
  const cached = cache.get(nodeId);
  if (cached) return cached;

  const renderPromise = (async () => {
    if (nodeId === EXPORT_NODE_ID) {
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      drawBackground(ctx, W, H, doc.global.bg);
      const sourceId = findIncomingSource(graph, nodeId, 'in');
      if (sourceId) {
        const rendered = await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache);
        ctx.drawImage(rendered, 0, 0);
      }
      return canvas;
    }

    const mergeNode = findMergeNode(graph, nodeId);
    if (mergeNode) {
      const baseId = findIncomingSource(graph, nodeId, 'a');
      const overlayId = findIncomingSource(graph, nodeId, 'b');
      const canvas = baseId
        ? cloneCanvas(await renderGraphNode(doc, graph, baseId, W, H, imageCache, options, cache), W, H)
        : createCanvas(W, H);
      if (overlayId) {
        const overlay = await renderGraphNode(doc, graph, overlayId, W, H, imageCache, options, cache);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.save();
        ctx.globalCompositeOperation = toCompositeOperation(mergeNode.blendMode);
        ctx.globalAlpha = mergeNode.opacity / 100;
        ctx.drawImage(overlay, 0, 0);
        ctx.restore();
      }
      return canvas;
    }

    const colorNode = findColorNode(graph, nodeId);
    if (colorNode) {
      const sourceId = findIncomingSource(graph, nodeId, 'in');
      const source = sourceId
        ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache)
        : createCanvas(W, H);
      return applyColorNode(source, colorNode, W, H);
    }

    const repeatNode = findRepeatNode(graph, nodeId);
    if (repeatNode) {
      const sourceId = findIncomingSource(graph, nodeId, 'in');
      const backdropId = findIncomingSource(graph, nodeId, 'bg');
      const source = sourceId
        ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache)
        : createCanvas(W, H);
      const backdrop = backdropId
        ? await renderGraphNode(doc, graph, backdropId, W, H, imageCache, options, cache)
        : null;
      return applyRepeatNode(source, backdrop, repeatNode, doc.global.seed, W, H);
    }

    const layer = findLayer(doc, nodeId);
    if (!layer) return createCanvas(W, H);

    const inputPort = layer.kind === 'effect' ? 'in' : 'bg';
    const sourceId = findIncomingSource(graph, nodeId, inputPort);
    const base = sourceId
      ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache)
      : createCanvas(W, H);
    const layerOptions =
      layer.kind === 'primitive' || layer.kind === 'noise' || layer.kind === 'array'
        ? { ...options, sourceLayout: 'full-frame' as const }
        : options;
    return applyLayerToCanvas(base, layer, doc, W, H, imageCache, layerOptions);
  })();

  cache.set(nodeId, renderPromise);
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
): Promise<HTMLCanvasElement> {
  return renderGraphNode(
    doc,
    graph,
    targetNodeId,
    W,
    H,
    imageCache,
    options,
    new Map<string, Promise<HTMLCanvasElement>>(),
  );
}
