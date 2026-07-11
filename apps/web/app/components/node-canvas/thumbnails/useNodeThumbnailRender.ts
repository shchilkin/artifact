import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type {
  CanvasDocument,
  CanvasGraph,
  ImageLayer,
  Layer,
  PrimitiveViewportStateConfig,
} from '../../../types/config';
import { logThumbnailInvalidation } from '../../../utils/devLogging';
import { imageCacheSignature } from '../../../utils/imageCacheSignature';
import { collectUpstreamNodeIds, EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { measurePerformancePhase, measurePerformancePhaseSync } from '../../../utils/performanceMeasure';
import { preloadImageSources } from '../../../utils/preloadImageSources';
import { type GraphRenderCache, renderGraphTarget } from '../../../utils/renderer';
import {
  colorNodeRenderSig,
  edgeRenderSig,
  environmentNodeRenderSig,
  grimeShadowNodeRenderSig,
  layerRenderSig,
  maskNodeRenderSig,
  materialNodeRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
  scene3DNodeRenderSig,
  shaderNodeRenderSig,
  transformNodeRenderSig,
} from '../../../utils/renderSignature';
import { useNodeCanvasPreview } from '../context';
import { getNodePreviewSize, NODE_PREVIEW_PASSIVE_RENDER_SCALE, NODE_PREVIEW_RENDER_SCALE } from './previewSizing';
import {
  scheduleThumbnailRender,
  THUMB_DEBOUNCE_MS,
  THUMBNAIL_DRAW_MEASURE,
  THUMBNAIL_GRAPH_RENDER_MEASURE,
  THUMBNAIL_PRELOAD_MEASURE,
} from './thumbnailQueue';

const THUMBNAIL_CACHE_LIMIT = 48;
const GRAPH_RENDER_CHAIN_CACHE_LIMIT = 192;
const thumbnailResultCache = new Map<string, HTMLCanvasElement>();
const thumbnailInflightCache = new Map<string, Promise<HTMLCanvasElement>>();
const thumbnailGraphRenderChainCache = new Map<string, Promise<HTMLCanvasElement>>();

function cloneCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}

function rememberThumbnail(key: string, canvas: HTMLCanvasElement) {
  thumbnailResultCache.delete(key);
  thumbnailResultCache.set(key, canvas);
  if (thumbnailResultCache.size <= THUMBNAIL_CACHE_LIMIT) return;
  const oldestKey = thumbnailResultCache.keys().next().value;
  if (oldestKey) thumbnailResultCache.delete(oldestKey);
}

function drawCanvas(target: HTMLCanvasElement, source: HTMLCanvasElement, width: number, height: number) {
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return true;
}

function signatureList(items: Array<{ id: string; sig: string }>) {
  return items.map(({ id, sig }) => `${id}:${sig}`).join(',');
}

function primitiveViewSignature(
  layers: Layer[],
  graph: CanvasGraph,
  primitiveViewStates: Record<string, PrimitiveViewportStateConfig>,
) {
  const ids = [
    ...layers.filter((layer) => layer.kind === 'primitive' || layer.kind === 'model').map((layer) => layer.id),
    ...(graph.scene3dNodes ?? []).map((node) => node.id),
  ];
  return ids
    .map((id) => {
      const view = primitiveViewStates[id];
      return view
        ? `${id}:${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}`
        : `${id}:default`;
    })
    .join('|');
}

function layerSignatures(layers: Layer[]) {
  return layers.map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    sig: layerRenderSig(layer),
  }));
}

function graphSignatureParts(graph: CanvasGraph) {
  return {
    mergeSignatures: renderSignatures(graph.mergeNodes, mergeNodeRenderSig),
    colorSignatures: renderSignatures(graph.colorNodes, colorNodeRenderSig),
    repeatSignatures: renderSignatures(graph.repeatNodes, repeatNodeRenderSig),
    materialSignatures: renderSignatures(graph.materialNodes, materialNodeRenderSig),
    maskSignatures: renderSignatures(graph.maskNodes, maskNodeRenderSig),
    transformSignatures: renderSignatures(graph.transformNodes, transformNodeRenderSig),
    grimeShadowSignatures: renderSignatures(graph.grimeShadowNodes, grimeShadowNodeRenderSig),
    scene3DSignatures: renderSignatures(graph.scene3dNodes, scene3DNodeRenderSig),
    environmentSignatures: renderSignatures(graph.environmentNodes, environmentNodeRenderSig),
    shaderSignatures: renderSignatures(graph.shaderNodes, shaderNodeRenderSig),
    edgeSignatures: renderSignatures(graph.edges, edgeRenderSig),
  };
}

function renderSignatures<T extends { id: string }>(items: T[] | undefined, signature: (item: T) => string) {
  return (items ?? []).map((item) => ({ id: item.id, sig: signature(item) }));
}

function collectThumbnailSignatureParts(previewTargetId: string, renderDoc: CanvasDocument, renderGraph: CanvasGraph) {
  const upstream = collectUpstreamNodeIds(previewTargetId, renderGraph);
  const upstreamHas = (id: string) => upstream.has(id);
  const layers = renderDoc.layers.filter((layer) => upstreamHas(layer.id));
  const graph = upstreamSignatureGraph(renderGraph, upstreamHas);

  return {
    layers,
    allLayers: renderDoc.layers,
    upstreamImageLayers: layers.filter((layer): layer is ImageLayer => layer.kind === 'image'),
    allImageLayers: renderDoc.layers.filter((layer): layer is ImageLayer => layer.kind === 'image'),
    layerSignatures: layerSignatures(layers),
    allLayerSignatures: layerSignatures(renderDoc.layers),
    ...graphSignatureParts(graph),
    allGraphSignatures: graphSignatureParts(renderGraph),
  };
}

function upstreamSignatureGraph(renderGraph: CanvasGraph, upstreamHas: (id: string) => boolean): CanvasGraph {
  return {
    edges: renderGraph.edges.filter((edge) => upstreamHas(edge.toId) && upstreamHas(edge.fromId)),
    mergeNodes: filterGraphNodes(renderGraph.mergeNodes, upstreamHas),
    colorNodes: filterGraphNodes(renderGraph.colorNodes, upstreamHas),
    repeatNodes: filterGraphNodes(renderGraph.repeatNodes, upstreamHas),
    materialNodes: filterGraphNodes(renderGraph.materialNodes, upstreamHas),
    maskNodes: filterGraphNodes(renderGraph.maskNodes, upstreamHas),
    transformNodes: filterGraphNodes(renderGraph.transformNodes, upstreamHas),
    grimeShadowNodes: filterGraphNodes(renderGraph.grimeShadowNodes, upstreamHas),
    scene3dNodes: filterGraphNodes(renderGraph.scene3dNodes, upstreamHas),
    environmentNodes: filterGraphNodes(renderGraph.environmentNodes, upstreamHas),
    shaderNodes: filterGraphNodes(renderGraph.shaderNodes, upstreamHas),
    positions: {},
  };
}

function filterGraphNodes<T extends { id: string }>(nodes: T[] | undefined, upstreamHas: (id: string) => boolean) {
  return (nodes ?? []).filter((node) => upstreamHas(node.id));
}

type PreviewSize = ReturnType<typeof getNodePreviewSize>;

interface ThumbnailRenderSnapshot {
  doc: CanvasDocument;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
  previewKey: string;
  renderStabilityKey: string;
  graphRenderSessionKey: string;
  previewSize: PreviewSize;
  isExportPreview: boolean;
  previewTargetId: string;
  primitiveViewStates: Record<string, PrimitiveViewportStateConfig>;
  isGraphDraggingRef: { current: boolean };
}

type ThumbnailLatestRef = { current: ThumbnailRenderSnapshot };
type ThumbnailCanvasRef = { current: HTMLCanvasElement | null };

function thumbnailEffectShouldPause(
  isFrameVisible: boolean,
  priority: boolean,
  isGraphDraggingRef: { current: boolean },
) {
  return (!isFrameVisible && !priority) || isGraphDraggingRef.current;
}

function drawCachedThumbnail(
  previewKey: string,
  canvasRef: ThumbnailCanvasRef,
  previewSize: PreviewSize,
  setHasRendered: (rendered: boolean) => void,
  setRenderedPreviewKey: (key: string) => void,
) {
  const cached = thumbnailResultCache.get(previewKey);
  if (!cached || !canvasRef.current) return false;
  const drawn = drawCanvas(canvasRef.current, cached, previewSize.render.width, previewSize.render.height);
  if (!drawn) return false;
  commitThumbnailReady(setHasRendered, setRenderedPreviewKey, previewKey);
  return true;
}

function commitThumbnailReady(
  setHasRendered: (rendered: boolean) => void,
  setRenderedPreviewKey: (key: string) => void,
  previewKey: string,
) {
  const commit = () => {
    setHasRendered(true);
    setRenderedPreviewKey(previewKey);
  };
  if (typeof window === 'undefined') {
    queueMicrotask(commit);
    return;
  }
  window.setTimeout(commit, 0);
}

function missingThumbnailImageSources(
  doc: CanvasDocument,
  graph: CanvasGraph,
  previewTargetId: string,
  imageCache: Map<string, HTMLImageElement>,
) {
  const upstream = collectUpstreamNodeIds(previewTargetId, graph);
  return doc.layers
    .filter((layer): layer is ImageLayer => layer.kind === 'image' && upstream.has(layer.id))
    .map((layer) => layer.src)
    .filter((src) => !imageCache.has(src));
}

function thumbnailRenderStale(
  latestRef: ThumbnailLatestRef,
  snapshot: ThumbnailRenderSnapshot,
  canvasRef: ThumbnailCanvasRef,
  isGraphDraggingRef: { current: boolean },
) {
  return (
    latestRef.current.renderStabilityKey !== snapshot.renderStabilityKey ||
    !canvasRef.current ||
    isGraphDraggingRef.current
  );
}

function createThumbnailRenderPromise(
  snapshot: ThumbnailRenderSnapshot,
  effectiveImageCache: Map<string, HTMLImageElement>,
) {
  const previewDoc: CanvasDocument = { ...snapshot.doc, graph: snapshot.graph };
  const graphRenderCache: GraphRenderCache = {
    namespace: snapshot.graphRenderSessionKey,
    entries: thumbnailGraphRenderChainCache,
    limit: GRAPH_RENDER_CHAIN_CACHE_LIMIT,
  };

  return (async () => {
    const result = await measurePerformancePhase(THUMBNAIL_GRAPH_RENDER_MEASURE, () =>
      renderGraphTarget(
        previewDoc,
        snapshot.graph,
        snapshot.previewTargetId,
        snapshot.previewSize.render.width,
        snapshot.previewSize.render.height,
        effectiveImageCache,
        {
          primitiveViewStates: snapshot.primitiveViewStates,
          effectResolution: snapshot.previewSize.aspect,
        },
        graphRenderCache,
      ),
    );
    const clone = cloneCanvas(result);
    rememberThumbnail(snapshot.previewKey, clone);
    return clone;
  })();
}

function thumbnailRenderPromise(snapshot: ThumbnailRenderSnapshot, effectiveImageCache: Map<string, HTMLImageElement>) {
  const cachedPromise = thumbnailInflightCache.get(snapshot.previewKey);
  if (cachedPromise) return cachedPromise;

  const renderPromise = createThumbnailRenderPromise(snapshot, effectiveImageCache);
  thumbnailInflightCache.set(snapshot.previewKey, renderPromise);
  renderPromise.finally(() => {
    if (thumbnailInflightCache.get(snapshot.previewKey) === renderPromise) {
      thumbnailInflightCache.delete(snapshot.previewKey);
    }
  });
  return renderPromise;
}

async function runThumbnailRenderJob({
  latestRef,
  canvasRef,
  setHasRendered,
  setRenderedPreviewKey,
}: {
  latestRef: ThumbnailLatestRef;
  canvasRef: ThumbnailCanvasRef;
  setHasRendered: (rendered: boolean) => void;
  setRenderedPreviewKey: (key: string) => void;
}) {
  const snapshot = latestRef.current;
  if (thumbnailRenderStale(latestRef, snapshot, canvasRef, snapshot.isGraphDraggingRef)) return;
  const effectiveImageCache = new Map(snapshot.imageCache);
  const missingImageSrcs = missingThumbnailImageSources(
    snapshot.doc,
    snapshot.graph,
    snapshot.previewTargetId,
    effectiveImageCache,
  );

  await measurePerformancePhase(THUMBNAIL_PRELOAD_MEASURE, async () => {
    await preloadImageSources(missingImageSrcs, snapshot.imageCache, effectiveImageCache);
  });
  if (thumbnailRenderStale(latestRef, snapshot, canvasRef, snapshot.isGraphDraggingRef)) return;

  const result = await thumbnailRenderPromise(snapshot, effectiveImageCache);
  if (thumbnailRenderStale(latestRef, snapshot, canvasRef, snapshot.isGraphDraggingRef)) return;
  drawRenderedThumbnail(result, snapshot, canvasRef, setHasRendered, setRenderedPreviewKey);
}

function drawRenderedThumbnail(
  result: HTMLCanvasElement,
  snapshot: ThumbnailRenderSnapshot,
  canvasRef: ThumbnailCanvasRef,
  setHasRendered: (rendered: boolean) => void,
  setRenderedPreviewKey: (key: string) => void,
) {
  const didDraw = measurePerformancePhaseSync(THUMBNAIL_DRAW_MEASURE, () =>
    drawCanvas(canvasRef.current!, result, snapshot.previewSize.render.width, snapshot.previewSize.render.height),
  );
  if (!didDraw) return;
  commitThumbnailReady(setHasRendered, setRenderedPreviewKey, snapshot.previewKey);
}

function selectPreviewValue<T>(priority: boolean, current: T, deferred: T) {
  return priority ? current : deferred;
}

function thumbnailRenderScale(priority: boolean) {
  return priority ? NODE_PREVIEW_RENDER_SCALE : NODE_PREVIEW_PASSIVE_RENDER_SCALE;
}

function hasMissingRequiredSource(doc: CanvasDocument, graph: CanvasGraph, previewTargetId: string) {
  const targetLayer = doc.layers.find((layer) => layer.id === previewTargetId);
  if (targetLayer?.kind !== 'effect') return false;
  return !graph.edges.some((edge) => edge.toId === previewTargetId && edge.toPort === 'in');
}

function thumbnailCanvasState(ready: boolean, hasRendered: boolean) {
  return {
    canvasOpacity: thumbnailCanvasOpacity(ready, hasRendered),
    showSkeleton: shouldShowThumbnailSkeleton(ready, hasRendered),
    showPreparing: shouldShowThumbnailPreparing(ready, hasRendered),
  };
}

function thumbnailCanvasOpacity(ready: boolean, hasRendered: boolean) {
  return ready || hasRendered ? 1 : 0;
}

function shouldShowThumbnailSkeleton(ready: boolean, hasRendered: boolean) {
  return !ready && !hasRendered;
}

function shouldShowThumbnailPreparing(ready: boolean, hasRendered: boolean) {
  return !ready && hasRendered;
}

function useThumbnailVisibility(priority: boolean, frameRef: { current: HTMLDivElement | null }) {
  const [isFrameVisible, setIsFrameVisible] = useState(() => priority || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (priority) return undefined;
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFrameVisible(entry.isIntersecting || entry.intersectionRatio > 0);
      },
      { root: null, rootMargin: '360px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [frameRef, priority]);

  return isFrameVisible;
}

export function useNodeThumbnailRender(previewTargetId: string, options: { priority?: boolean } = {}) {
  const { doc, graph, imageCache, primitiveViewStates, isGraphDraggingRef } = useNodeCanvasPreview();
  const { priority = false } = options;
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isFrameVisible = useThumbnailVisibility(priority, frameRef);

  // Dev-only: previous render signatures keyed by item id, used for change logging.
  const prevLayerSigsRef = useRef<Map<string, string>>(new Map());
  const prevMergeSigsRef = useRef<Map<string, string>>(new Map());
  const prevColorSigsRef = useRef<Map<string, string>>(new Map());
  const prevRepeatSigsRef = useRef<Map<string, string>>(new Map());
  const prevMaterialSigsRef = useRef<Map<string, string>>(new Map());
  const prevMaskSigsRef = useRef<Map<string, string>>(new Map());
  const prevTransformSigsRef = useRef<Map<string, string>>(new Map());
  const prevGrimeShadowSigsRef = useRef<Map<string, string>>(new Map());
  const prevShaderSigsRef = useRef<Map<string, string>>(new Map());
  const prevEdgeSigsRef = useRef<Map<string, string>>(new Map());

  const isExportPreview = previewTargetId === EXPORT_NODE_ID;
  const deferredDoc = useDeferredValue(doc);
  const deferredGraph = useDeferredValue(graph);
  const deferredPrimitiveViewStates = useDeferredValue(primitiveViewStates);
  const renderDoc = selectPreviewValue(priority, doc, deferredDoc);
  const renderGraph = selectPreviewValue(priority, graph, deferredGraph);
  const renderPrimitiveViewStates = selectPreviewValue(priority, primitiveViewStates, deferredPrimitiveViewStates);
  const renderScale = thumbnailRenderScale(priority);
  const previewSize = useMemo(
    () => getNodePreviewSize(renderDoc.global.aspect ?? '1:1', undefined, renderScale),
    [renderDoc.global.aspect, renderScale],
  );

  const signatureData = useMemo(() => {
    const {
      layers,
      allLayers,
      upstreamImageLayers,
      allImageLayers,
      layerSignatures,
      allLayerSignatures,
      mergeSignatures,
      colorSignatures,
      repeatSignatures,
      materialSignatures,
      maskSignatures,
      transformSignatures,
      grimeShadowSignatures,
      scene3DSignatures,
      environmentSignatures,
      shaderSignatures,
      edgeSignatures,
      allGraphSignatures,
    } = collectThumbnailSignatureParts(previewTargetId, renderDoc, renderGraph);

    const basePreviewKeyParts = [
      previewTargetId,
      `${previewSize.render.width}x${previewSize.render.height}`,
      `display:${previewSize.display.width}x${previewSize.display.height}`,
      renderDoc.global.bg,
      renderDoc.global.seed,
      renderDoc.global.aspect,
      signatureList(layerSignatures),
      signatureList(mergeSignatures),
      signatureList(colorSignatures),
      signatureList(repeatSignatures),
      signatureList(materialSignatures),
      signatureList(maskSignatures),
      signatureList(transformSignatures),
      signatureList(grimeShadowSignatures),
      signatureList(scene3DSignatures),
      signatureList(environmentSignatures),
      signatureList(shaderSignatures),
      signatureList(edgeSignatures),
      primitiveViewSignature(layers, renderGraph, renderPrimitiveViewStates),
      imageCacheSignature(upstreamImageLayers, imageCache),
    ];
    const previewKey = [...basePreviewKeyParts].join('::');
    const renderStabilityKey = [...basePreviewKeyParts].join('::');

    const graphRenderSessionKey = [
      `${previewSize.render.width}x${previewSize.render.height}`,
      `effect:${previewSize.aspect.width}x${previewSize.aspect.height}`,
      renderDoc.global.bg,
      renderDoc.global.seed,
      renderDoc.global.aspect,
      signatureList(allLayerSignatures),
      signatureList(allGraphSignatures.mergeSignatures),
      signatureList(allGraphSignatures.colorSignatures),
      signatureList(allGraphSignatures.repeatSignatures),
      signatureList(allGraphSignatures.materialSignatures),
      signatureList(allGraphSignatures.maskSignatures),
      signatureList(allGraphSignatures.transformSignatures),
      signatureList(allGraphSignatures.grimeShadowSignatures),
      signatureList(allGraphSignatures.scene3DSignatures),
      signatureList(allGraphSignatures.environmentSignatures),
      signatureList(allGraphSignatures.shaderSignatures),
      signatureList(allGraphSignatures.edgeSignatures),
      primitiveViewSignature(allLayers, renderGraph, renderPrimitiveViewStates),
      imageCacheSignature(allImageLayers, imageCache),
    ].join('::');

    return {
      previewKey,
      renderStabilityKey,
      graphRenderSessionKey,
      layerSignatures,
      mergeSignatures,
      colorSignatures,
      repeatSignatures,
      materialSignatures,
      maskSignatures,
      transformSignatures,
      grimeShadowSignatures,
      shaderSignatures,
      edgeSignatures,
    };
  }, [renderDoc, renderGraph, previewSize, previewTargetId, renderPrimitiveViewStates, imageCache]);
  const { graphRenderSessionKey, previewKey, renderStabilityKey } = signatureData;

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    signatureData.layerSignatures.forEach(({ id, kind, sig }) => {
      const prev = prevLayerSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'layer', targetId: previewTargetId, itemId: id, itemKind: kind });
      }
      prevLayerSigsRef.current.set(id, sig);
    });

    signatureData.mergeSignatures.forEach(({ id, sig }) => {
      const prev = prevMergeSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'merge' });
      }
      prevMergeSigsRef.current.set(id, sig);
    });

    signatureData.colorSignatures.forEach(({ id, sig }) => {
      const prev = prevColorSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'color' });
      }
      prevColorSigsRef.current.set(id, sig);
    });

    signatureData.repeatSignatures.forEach(({ id, sig }) => {
      const prev = prevRepeatSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'repeat' });
      }
      prevRepeatSigsRef.current.set(id, sig);
    });

    signatureData.materialSignatures.forEach(({ id, sig }) => {
      const prev = prevMaterialSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'material' });
      }
      prevMaterialSigsRef.current.set(id, sig);
    });

    signatureData.maskSignatures.forEach(({ id, sig }) => {
      const prev = prevMaskSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'mask' });
      }
      prevMaskSigsRef.current.set(id, sig);
    });

    signatureData.transformSignatures.forEach(({ id, sig }) => {
      const prev = prevTransformSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'transform' });
      }
      prevTransformSigsRef.current.set(id, sig);
    });

    signatureData.grimeShadowSignatures.forEach(({ id, sig }) => {
      const prev = prevGrimeShadowSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'grimeShadow' });
      }
      prevGrimeShadowSigsRef.current.set(id, sig);
    });

    signatureData.shaderSignatures.forEach(({ id, sig }) => {
      const prev = prevShaderSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'shader' });
      }
      prevShaderSigsRef.current.set(id, sig);
    });

    signatureData.edgeSignatures.forEach(({ id, sig }) => {
      const prev = prevEdgeSigsRef.current.get(id);
      if (prev !== undefined && prev !== sig) {
        logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: id, itemKind: 'edge' });
      }
      prevEdgeSigsRef.current.set(id, sig);
    });
  }, [previewTargetId, signatureData]);

  const latestRef = useRef({
    doc: renderDoc,
    graph: renderGraph,
    imageCache,
    previewKey,
    renderStabilityKey,
    graphRenderSessionKey,
    previewSize,
    isExportPreview,
    previewTargetId,
    primitiveViewStates: renderPrimitiveViewStates,

    isGraphDraggingRef,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      doc: renderDoc,
      graph: renderGraph,
      imageCache,
      previewKey,
      renderStabilityKey,
      graphRenderSessionKey,
      previewSize,
      isExportPreview,
      previewTargetId,
      primitiveViewStates: renderPrimitiveViewStates,
      isGraphDraggingRef,
    };
  }, [
    imageCache,
    isExportPreview,
    isGraphDraggingRef,
    graphRenderSessionKey,
    previewKey,
    renderStabilityKey,
    previewSize,
    previewTargetId,
    renderDoc,
    renderGraph,
    renderPrimitiveViewStates,
  ]);

  const [hasRendered, setHasRendered] = useState(false);
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const ready = renderedPreviewKey === previewKey;
  const missingRequiredSource = useMemo(
    () => hasMissingRequiredSource(doc, graph, previewTargetId),
    [doc, graph, previewTargetId],
  );
  const canvasState = thumbnailCanvasState(ready, hasRendered);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (thumbnailEffectShouldPause(isFrameVisible, priority, isGraphDraggingRef)) return () => undefined;
    if (drawCachedThumbnail(previewKey, canvasRef, previewSize, setHasRendered, setRenderedPreviewKey)) {
      return () => undefined;
    }

    debounceRef.current = setTimeout(
      () => {
        scheduleThumbnailRender(
          previewTargetId,
          () =>
            runThumbnailRenderJob({
              latestRef,
              canvasRef,
              setHasRendered,
              setRenderedPreviewKey,
            }),
          { priority },
        );
      },
      priority ? 20 : THUMB_DEBOUNCE_MS,
    );

    return () => clearTimeout(debounceRef.current);
  }, [isFrameVisible, isExportPreview, isGraphDraggingRef, priority, previewKey, previewSize, previewTargetId]);

  return {
    frameRef,
    canvasRef,
    isExportPreview,
    previewSize,
    ...canvasState,
    missingRequiredSource,
  };
}
