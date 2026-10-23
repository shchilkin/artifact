import type { CanvasDocument, CanvasGraph, EffectLayer, Layer } from '../../types/config';
import { EXPORT_NODE_ID, findGraphNode, findGraphNodeOfKind } from '../nodeGraph';
import type { GraphNodeKind, GraphNodeOfKind } from '../nodeKinds';
import { createCanvas, drawBackground, isDrawableCanvas } from './canvas';
import { findIncomingSource, graphLayerInputPort } from './graphInputs';
import { applyGpuOnlyEffectLayerChain, applyLayerToCanvas, isGpuOnlyEffectLayer, type RenderOptions } from './layers';
import {
  findLayer,
  type GraphNodeRenderContext,
  graphNodeRenderer,
  resolveMaterialTextureCanvases,
  shaderMaterialConfig,
  throwIfRenderAborted,
} from './nodeKinds';

const GRAPH_RENDER_CACHE_LIMIT = 160;
export interface GraphRenderCache {
  namespace: string;
  entries: Map<string, Promise<HTMLCanvasElement>>;
  entryKey?: (nodeId: string) => string | null;
  limit?: number;
}

interface GpuEffectChain {
  baseSourceId: string | null;
  layers: EffectLayer[];
}

/** Two or more GPU-only effect layers in a row: their filters run in one GPU pass. */
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

function normalizeRenderedCanvas(canvas: HTMLCanvasElement, W: number, H: number): HTMLCanvasElement {
  return isDrawableCanvas(canvas) ? canvas : createCanvas(W, H);
}

function withGraphPrimitiveViewStates(doc: CanvasDocument, graph: CanvasGraph, options: RenderOptions): RenderOptions {
  const primitiveViewStates = {
    ...(doc.graph.primitiveViewStates ?? {}),
    ...(graph.primitiveViewStates ?? {}),
    ...(options.primitiveViewStates ?? {}),
  };
  if (Object.keys(primitiveViewStates).length === 0) return options;
  return { ...options, primitiveViewStates };
}

async function renderExportGraphNode(context: GraphNodeRenderContext) {
  const nodeId = EXPORT_NODE_ID;
  const { doc, graph, W, H, options, renderDependency } = context;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // The document background is part of the output in every mode; `bg: 'transparent'` keeps it transparent.
  drawBackground(ctx, W, H, doc.global.bg);
  const sourceId = findIncomingSource(graph, nodeId, 'in');
  if (!sourceId) return canvas;
  const rendered = await renderDependency(sourceId);
  throwIfRenderAborted(options);
  ctx.drawImage(rendered, 0, 0);
  return canvas;
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
  const { baseSourceId, layers } = gpuEffectChain;
  const source = baseSourceId ? await renderDependency(baseSourceId) : createCanvas(W, H);
  throwIfRenderAborted(options);
  return applyGpuOnlyEffectLayerChain(source, layers, doc, W, H, options);
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
  const material = materialId ? findGraphNodeOfKind(graph, 'material', materialId) : undefined;
  const materialShader = materialId ? findGraphNodeOfKind(graph, 'shader', materialId) : undefined;
  const materialConfig = material ?? (materialShader ? shaderMaterialConfig(materialShader.id) : undefined);
  const materialTextures = materialId ? await resolveMaterialTextureCanvases(materialId, context) : null;
  const primitiveMaterials = materialConfig
    ? { ...(options.primitiveMaterials ?? {}), [layer.id]: materialConfig }
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

async function renderGraphNodeUncached(nodeId: string, context: GraphNodeRenderContext) {
  throwIfRenderAborted(context.options);
  if (nodeId === EXPORT_NODE_ID) return renderExportGraphNode(context);
  const node = findGraphNode(context.graph, nodeId);
  if (node) return renderGraphOnlyNode(node, context);
  return renderLayerGraphNode(nodeId, context);
}

function renderGraphOnlyNode<K extends GraphNodeKind>(node: GraphNodeOfKind<K>, context: GraphNodeRenderContext) {
  return graphNodeRenderer<K>(node.kind as K)(node, context);
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
  if (cached) {
    // Least recently used goes first: a hit moves the entry to the end of the pruning order.
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached.then((canvas) => normalizeRenderedCanvas(canvas, W, H));
  }
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
  }).then((canvas) => normalizeRenderedCanvas(canvas, W, H));

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
