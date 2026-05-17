import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CanvasDocument, ImageLayer } from '../../../types/config';
import { logThumbnailInvalidation } from '../../../utils/devLogging';
import { collectUpstreamNodeIds, EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { renderDocument, renderGraphTarget } from '../../../utils/renderer';
import { useNodeCanvasPreview } from '../context';
import { getNodePreviewSize } from './previewSizing';
import {
  colorNodeRenderSig,
  edgeRenderSig,
  layerRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
} from './renderSignature';
import { scheduleThumbnailRender, THUMB_DEBOUNCE_MS } from './thumbnailQueue';

const THUMBNAIL_CACHE_LIMIT = 48;
const thumbnailResultCache = new Map<string, HTMLCanvasElement>();
const thumbnailInflightCache = new Map<string, Promise<HTMLCanvasElement>>();

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

export function useNodeThumbnailRender(previewTargetId: string, options: { priority?: boolean } = {}) {
  const { doc, graph, imageCache, primitiveViewStates, isGraphDraggingRef } = useNodeCanvasPreview();
  const { priority = false } = options;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Dev-only: previous render signatures keyed by item id, used for change logging.
  const prevLayerSigsRef = useRef<Map<string, string>>(new Map());
  const prevMergeSigsRef = useRef<Map<string, string>>(new Map());
  const prevColorSigsRef = useRef<Map<string, string>>(new Map());
  const prevRepeatSigsRef = useRef<Map<string, string>>(new Map());
  const prevEdgeSigsRef = useRef<Map<string, string>>(new Map());

  const isExportPreview = previewTargetId === EXPORT_NODE_ID;
  const previewSize = useMemo(() => getNodePreviewSize(doc.global.aspect ?? '1:1'), [doc.global.aspect]);

  const signatureData = useMemo(() => {
    const upstream = collectUpstreamNodeIds(previewTargetId, graph);
    const layers = doc.layers.filter((layer) => upstream.has(layer.id));
    const mergeNodes = graph.mergeNodes.filter((node) => upstream.has(node.id));
    const colorNodes = (graph.colorNodes ?? []).filter((node) => upstream.has(node.id));
    const repeatNodes = (graph.repeatNodes ?? []).filter((node) => upstream.has(node.id));
    const edges = graph.edges.filter((edge) => upstream.has(edge.toId) && upstream.has(edge.fromId));

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

    const primitiveViewSignature = layers
      .filter((layer) => layer.kind === 'primitive')
      .map((layer) => {
        const view = primitiveViewStates[layer.id];
        return view
          ? `${layer.id}:${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}`
          : `${layer.id}:default`;
      })
      .join('|');

    const previewKey = [
      previewTargetId,
      `${previewSize.render.width}x${previewSize.render.height}`,
      `display:${previewSize.display.width}x${previewSize.display.height}`,
      doc.global.bg,
      doc.global.seed,
      doc.global.aspect,
      layerSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      mergeSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      colorSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      repeatSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      edgeSignatures.map(({ id, sig }) => `${id}:${sig}`).join(','),
      primitiveViewSignature,
    ].join('::');

    return {
      previewKey,
      layerSignatures,
      mergeSignatures,
      colorSignatures,
      repeatSignatures,
      edgeSignatures,
    };
  }, [
    doc.global.aspect,
    doc.global.bg,
    doc.global.seed,
    doc.layers,
    graph,
    previewSize,
    previewTargetId,
    primitiveViewStates,
  ]);
  const { previewKey } = signatureData;

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
    doc,
    graph,
    imageCache,
    previewKey,
    previewSize,
    isExportPreview,
    previewTargetId,
    primitiveViewStates,
    isGraphDraggingRef,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      doc,
      graph,
      imageCache,
      previewKey,
      previewSize,
      isExportPreview,
      previewTargetId,
      primitiveViewStates,
      isGraphDraggingRef,
    };
  }, [
    doc,
    graph,
    imageCache,
    isExportPreview,
    isGraphDraggingRef,
    previewKey,
    previewSize,
    previewTargetId,
    primitiveViewStates,
  ]);

  const [hasRendered, setHasRendered] = useState(false);
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const ready = renderedPreviewKey === previewKey;

  useEffect(() => {
    const rev = ++revRef.current;
    clearTimeout(debounceRef.current);
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
        scheduleThumbnailRender(previewTargetId, async () => {
          const {
            doc: d,
            graph: g,
            imageCache: cachedImages,
            previewKey: pk,
            previewSize: latestPreviewSize,
            isExportPreview: latestIsExportPreview,
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

          await Promise.all(preloads);
          if (rev !== revRef.current || !canvasRef.current || latestIsGraphDraggingRef.current) return;

          let renderPromise = thumbnailInflightCache.get(pk);
          if (!renderPromise) {
            renderPromise = (async () => {
              const previewDoc: CanvasDocument = { ...d, graph: g };
              const result = latestIsExportPreview
                ? await renderDocument(
                    previewDoc,
                    latestPreviewSize.render.width,
                    latestPreviewSize.render.height,
                    effectiveImageCache,
                    {
                      primitiveViewStates: latestPrimitiveViewStates,
                      effectResolution: latestPreviewSize.aspect,
                    },
                  )
                : await renderGraphTarget(
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
          if (!drawCanvas(canvasRef.current, result, latestPreviewSize.render.width, latestPreviewSize.render.height))
            return;
          setHasRendered(true);
          setRenderedPreviewKey(pk);
        });
      },
      priority ? 20 : THUMB_DEBOUNCE_MS,
    );

    return () => clearTimeout(debounceRef.current);
  }, [
    imageCache,
    isGraphDraggingRef,
    priority,
    previewKey,
    previewSize.render.height,
    previewSize.render.width,
    previewTargetId,
  ]);

  return {
    canvasRef,
    isExportPreview,
    previewSize,
    canvasOpacity: ready ? 1 : hasRendered ? 1 : 0,
    showSkeleton: !ready && !hasRendered,
    showPreparing: !ready && hasRendered,
  };
}
