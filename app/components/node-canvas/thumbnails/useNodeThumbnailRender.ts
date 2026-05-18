import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CanvasDocument, ImageLayer } from '../../../types/config';
import { logThumbnailInvalidation } from '../../../utils/devLogging';
import { collectUpstreamNodeIds, EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { type GraphRenderCache, renderGraphTarget } from '../../../utils/renderer';
import { useNodeCanvasPreview } from '../context';
import { getNodePreviewSize, NODE_PREVIEW_PASSIVE_RENDER_SCALE, NODE_PREVIEW_RENDER_SCALE } from './previewSizing';
import {
  colorNodeRenderSig,
  edgeRenderSig,
  layerRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
} from './renderSignature';
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

function imageCacheSignature(layers: ImageLayer[], imageCache: Map<string, HTMLImageElement>) {
  return layers
    .map((layer) => {
      const image = imageCache.get(layer.src);
      return `${layer.id}:${layer.src}:${image ? `${image.naturalWidth}x${image.naturalHeight}` : 'missing'}`;
    })
    .join(',');
}

function drawCanvas(target: HTMLCanvasElement, source: HTMLCanvasElement, width: number, height: number) {
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return true;
}

async function measureThumbnailPhase<T>(measureName: string, task: () => Promise<T>) {
  if (typeof performance === 'undefined') return task();

  const markId = `${measureName}:${Math.random().toString(36).slice(2)}`;
  const startMark = `${markId}:start`;
  const endMark = `${markId}:end`;
  try {
    performance.mark(startMark);
    const result = await task();
    performance.mark(endMark);
    performance.measure(measureName, startMark, endMark);
    return result;
  } finally {
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
  }
}

function measureThumbnailPhaseSync<T>(measureName: string, task: () => T) {
  if (typeof performance === 'undefined') return task();

  const markId = `${measureName}:${Math.random().toString(36).slice(2)}`;
  const startMark = `${markId}:start`;
  const endMark = `${markId}:end`;
  try {
    performance.mark(startMark);
    const result = task();
    performance.mark(endMark);
    performance.measure(measureName, startMark, endMark);
    return result;
  } finally {
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
  }
}

export function useNodeThumbnailRender(previewTargetId: string, options: { priority?: boolean } = {}) {
  const { doc, graph, imageCache, primitiveViewStates, isGraphDraggingRef } = useNodeCanvasPreview();
  const { priority = false } = options;
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [isFrameVisible, setIsFrameVisible] = useState(() => priority || typeof IntersectionObserver === 'undefined');

  // Dev-only: previous render signatures keyed by item id, used for change logging.
  const prevLayerSigsRef = useRef<Map<string, string>>(new Map());
  const prevMergeSigsRef = useRef<Map<string, string>>(new Map());
  const prevColorSigsRef = useRef<Map<string, string>>(new Map());
  const prevRepeatSigsRef = useRef<Map<string, string>>(new Map());
  const prevEdgeSigsRef = useRef<Map<string, string>>(new Map());

  const isExportPreview = previewTargetId === EXPORT_NODE_ID;
  const immediatePreview = priority;
  const deferredDoc = useDeferredValue(doc);
  const deferredGraph = useDeferredValue(graph);
  const deferredPrimitiveViewStates = useDeferredValue(primitiveViewStates);
  const renderDoc = immediatePreview ? doc : deferredDoc;
  const renderGraph = immediatePreview ? graph : deferredGraph;
  const renderPrimitiveViewStates = immediatePreview ? primitiveViewStates : deferredPrimitiveViewStates;
  const renderScale = priority ? NODE_PREVIEW_RENDER_SCALE : NODE_PREVIEW_PASSIVE_RENDER_SCALE;
  const previewSize = useMemo(
    () => getNodePreviewSize(renderDoc.global.aspect ?? '1:1', undefined, renderScale),
    [renderDoc.global.aspect, renderScale],
  );

  const signatureData = useMemo(() => {
    const upstream = collectUpstreamNodeIds(previewTargetId, renderGraph);
    const layers = renderDoc.layers.filter((layer) => upstream.has(layer.id));
    const mergeNodes = renderGraph.mergeNodes.filter((node) => upstream.has(node.id));
    const colorNodes = (renderGraph.colorNodes ?? []).filter((node) => upstream.has(node.id));
    const repeatNodes = (renderGraph.repeatNodes ?? []).filter((node) => upstream.has(node.id));
    const edges = renderGraph.edges.filter((edge) => upstream.has(edge.toId) && upstream.has(edge.fromId));
    const upstreamImageLayers = layers.filter((layer): layer is ImageLayer => layer.kind === 'image');
    const allImageLayers = renderDoc.layers.filter((layer): layer is ImageLayer => layer.kind === 'image');

    const layerSignatures = layers.map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      sig: layerRenderSig(layer),
    }));
    const mergeSignatures = mergeNodes.map((node) => ({
      id: node.id,
      sig: mergeNodeRenderSig(node),
    }));
    const colorSignatures = colorNodes.map((node) => ({
      id: node.id,
      sig: colorNodeRenderSig(node),
    }));
    const repeatSignatures = repeatNodes.map((node) => ({
      id: node.id,
      sig: repeatNodeRenderSig(node),
    }));
    const edgeSignatures = edges.map((edge) => ({
      id: edge.id,
      sig: edgeRenderSig(edge),
    }));
    const allLayerSignatures = renderDoc.layers.map((layer) => ({
      id: layer.id,
      sig: layerRenderSig(layer),
    }));
    const allMergeSignatures = renderGraph.mergeNodes.map((node) => ({
      id: node.id,
      sig: mergeNodeRenderSig(node),
    }));
    const allColorSignatures = (renderGraph.colorNodes ?? []).map((node) => ({
      id: node.id,
      sig: colorNodeRenderSig(node),
    }));
    const allRepeatSignatures = (renderGraph.repeatNodes ?? []).map((node) => ({
      id: node.id,
      sig: repeatNodeRenderSig(node),
    }));
    const allEdgeSignatures = renderGraph.edges.map((edge) => ({
      id: edge.id,
      sig: edgeRenderSig(edge),
    }));

    const primitiveViewSignature = layers
      .filter((layer) => layer.kind === 'primitive')
      .map((layer) => {
        const view = renderPrimitiveViewStates[layer.id];
        return view
          ? `${layer.id}:${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}`
          : `${layer.id}:default`;
      })
      .join('|');
    const allPrimitiveViewSignature = renderDoc.layers
      .filter((layer) => layer.kind === 'primitive')
      .map((layer) => {
        const view = renderPrimitiveViewStates[layer.id];
        return view
          ? `${layer.id}:${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}`
          : `${layer.id}:default`;
      })
      .join('|');
    const imageSignature = imageCacheSignature(upstreamImageLayers, imageCache);
    const graphRenderImageSignature = imageCacheSignature(allImageLayers, imageCache);

    const previewKey = [
      previewTargetId,
      `${previewSize.render.width}x${previewSize.render.height}`,
      `display:${previewSize.display.width}x${previewSize.display.height}`,
      renderDoc.global.bg,
      renderDoc.global.seed,
      renderDoc.global.aspect,
      layerSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      mergeSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      colorSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      repeatSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      edgeSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      primitiveViewSignature,
      imageSignature,
    ].join('::');

    const graphRenderSessionKey = [
      `${previewSize.render.width}x${previewSize.render.height}`,
      `effect:${previewSize.aspect.width}x${previewSize.aspect.height}`,
      renderDoc.global.bg,
      renderDoc.global.seed,
      renderDoc.global.aspect,
      allLayerSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      allMergeSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      allColorSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      allRepeatSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      allEdgeSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      allPrimitiveViewSignature,
      graphRenderImageSignature,
    ].join('::');

    return {
      previewKey,
      graphRenderSessionKey,
      layerSignatures,
      mergeSignatures,
      colorSignatures,
      repeatSignatures,
      edgeSignatures,
    };
  }, [
    renderDoc.global.aspect,
    renderDoc.global.bg,
    renderDoc.global.seed,
    renderDoc.layers,
    renderGraph,
    previewSize,
    previewTargetId,
    renderPrimitiveViewStates,
    imageCache,
  ]);
  const { graphRenderSessionKey, previewKey } = signatureData;

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
    previewSize,
    previewTargetId,
    renderDoc,
    renderGraph,
    renderPrimitiveViewStates,
  ]);

  const [hasRendered, setHasRendered] = useState(false);
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const ready = renderedPreviewKey === previewKey;

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
  }, [priority]);

  useEffect(() => {
    const rev = ++revRef.current;
    clearTimeout(debounceRef.current);
    if (!isFrameVisible && !priority) return () => undefined;
    if (isGraphDraggingRef.current) return () => undefined;
    const cached = thumbnailResultCache.get(previewKey);
    if (cached && canvasRef.current) {
      if (drawCanvas(canvasRef.current, cached, previewSize.render.width, previewSize.render.height)) {
        setHasRendered(true);
        setRenderedPreviewKey(previewKey);
      }
      return () => undefined;
    }

    debounceRef.current = setTimeout(
      () => {
        scheduleThumbnailRender(
          previewTargetId,
          async () => {
            const {
              doc: d,
              graph: g,
              imageCache: cachedImages,
              previewKey: pk,
              graphRenderSessionKey: latestGraphRenderSessionKey,
              previewSize: latestPreviewSize,
              previewTargetId: latestPreviewTargetId,
              primitiveViewStates: latestPrimitiveViewStates,
              isGraphDraggingRef: latestIsGraphDraggingRef,
            } = latestRef.current;
            if (latestIsGraphDraggingRef.current) return;
            const effectiveImageCache = new Map(cachedImages);
            const upstream = collectUpstreamNodeIds(latestPreviewTargetId, g);
            const missingImageSrcs = d.layers
              .filter((layer): layer is ImageLayer => layer.kind === 'image' && upstream.has(layer.id))
              .map((layer) => layer.src)
              .filter((src) => !effectiveImageCache.has(src));

            const preloads = missingImageSrcs.map(
              (src) =>
                new Promise<void>((resolve) => {
                  const image = new Image();
                  image.onload = () => {
                    cachedImages.set(src, image);
                    effectiveImageCache.set(src, image);
                    resolve();
                  };
                  image.onerror = () => resolve();
                  image.src = src;
                }),
            );

            await measureThumbnailPhase(THUMBNAIL_PRELOAD_MEASURE, async () => {
              await Promise.all(preloads);
            });
            if (rev !== revRef.current || !canvasRef.current || latestIsGraphDraggingRef.current) return;

            let renderPromise = thumbnailInflightCache.get(pk);
            if (!renderPromise) {
              renderPromise = (async () => {
                const previewDoc: CanvasDocument = { ...d, graph: g };
                const graphRenderCache: GraphRenderCache = {
                  namespace: latestGraphRenderSessionKey,
                  entries: thumbnailGraphRenderChainCache,
                  limit: GRAPH_RENDER_CHAIN_CACHE_LIMIT,
                };
                const result = await measureThumbnailPhase(THUMBNAIL_GRAPH_RENDER_MEASURE, () =>
                  renderGraphTarget(
                    previewDoc,
                    g,
                    latestPreviewTargetId,
                    latestPreviewSize.render.width,
                    latestPreviewSize.render.height,
                    effectiveImageCache,
                    {
                      primitiveViewStates: latestPrimitiveViewStates,
                      effectResolution: latestPreviewSize.aspect,
                    },
                    graphRenderCache,
                  ),
                );
                const clone = cloneCanvas(result);
                rememberThumbnail(pk, clone);
                return clone;
              })();
              thumbnailInflightCache.set(pk, renderPromise);
              renderPromise.finally(() => {
                if (thumbnailInflightCache.get(pk) === renderPromise) {
                  thumbnailInflightCache.delete(pk);
                }
              });
            }

            const result = await renderPromise;
            if (rev !== revRef.current || !canvasRef.current || latestIsGraphDraggingRef.current) return;
            const didDraw = measureThumbnailPhaseSync(THUMBNAIL_DRAW_MEASURE, () =>
              drawCanvas(canvasRef.current!, result, latestPreviewSize.render.width, latestPreviewSize.render.height),
            );
            if (!didDraw) return;
            setHasRendered(true);
            setRenderedPreviewKey(pk);
          },
          { priority },
        );
      },
      priority ? 20 : THUMB_DEBOUNCE_MS,
    );

    return () => clearTimeout(debounceRef.current);
  }, [
    isFrameVisible,
    isExportPreview,
    isGraphDraggingRef,
    priority,
    previewKey,
    previewSize.render.height,
    previewSize.render.width,
    previewTargetId,
  ]);

  return {
    frameRef,
    canvasRef,
    isExportPreview,
    previewSize,
    canvasOpacity: ready ? 1 : hasRendered ? 1 : 0,
    showSkeleton: !ready && !hasRendered,
    showPreparing: !ready && hasRendered,
  };
}
