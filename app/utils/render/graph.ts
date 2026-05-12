import type { CanvasDocument, CanvasGraph, GraphColorNode, GraphMergeNode, Layer } from '../../types/config';
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

function findLayer(doc: CanvasDocument, nodeId: string): Layer | undefined {
  return doc.layers.find((layer) => layer.id === nodeId);
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
