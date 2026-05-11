import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ImageLayer } from '../../../types/config';
import { ASPECT_SIZES } from '../../../types/config';
import { renderDocument, renderGraphTarget } from '../../../utils/renderer';
import { EXPORT_NODE_ID, collectUpstreamNodeIds } from '../../../utils/nodeGraph';
import { logThumbnailInvalidation } from '../../../utils/devLogging';
import { useNodeCanvasPreview } from '../context';
import { THUMB_SIZE } from '../constants';
import type { ThumbProps } from '../types';
import { scheduleThumbnailRender, THUMB_DEBOUNCE_MS } from './thumbnailQueue';
import { layerRenderSig, mergeNodeRenderSig, colorNodeRenderSig, edgeRenderSig } from './renderSignature';

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

export const NodeThumbnail = memo(function NodeThumbnail({ previewTargetId }: ThumbProps) {
  const { doc, graph, imageCache, primitiveViewStates } = useNodeCanvasPreview();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Dev-only: previous render signatures keyed by item id, used for change logging.
  const prevLayerSigsRef = useRef<Map<string, string>>(new Map());
  const prevMergeSigsRef = useRef<Map<string, string>>(new Map());
  const prevColorSigsRef = useRef<Map<string, string>>(new Map());
  const prevEdgeSigsRef = useRef<Map<string, string>>(new Map());

  const isExportPreview = previewTargetId === EXPORT_NODE_ID;
  const previewSize = useMemo(() => {
    if (!isExportPreview) {
      return { width: THUMB_SIZE, height: THUMB_SIZE };
    }
    const [aspectWidth, aspectHeight] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
    const scale = THUMB_SIZE / aspectWidth;
    return {
      width: Math.max(1, Math.round(aspectWidth * scale)),
      height: Math.max(1, Math.round(aspectHeight * scale)),
    };
  }, [doc.global.aspect, isExportPreview]);

  const previewKey = useMemo(() => {
    const upstream = collectUpstreamNodeIds(previewTargetId, graph);
    const layers = doc.layers.filter((layer) => upstream.has(layer.id));
    const mergeNodes = graph.mergeNodes.filter((node) => upstream.has(node.id));
    const colorNodes = (graph.colorNodes ?? []).filter((node) => upstream.has(node.id));
    const edges = graph.edges.filter((edge) => upstream.has(edge.toId) && upstream.has(edge.fromId));

    // Content-based signatures: only render-relevant fields, no object identity.
    // Renaming a layer or toggling its lock never changes these strings.
    const layerSignature = layers.map((layer) => {
      const sig = layerRenderSig(layer);
      if (import.meta.env.DEV) {
        const prev = prevLayerSigsRef.current.get(layer.id);
        if (prev !== undefined && prev !== sig) {
          logThumbnailInvalidation({ cause: 'layer', targetId: previewTargetId, itemId: layer.id, itemKind: layer.kind });
        }
        prevLayerSigsRef.current.set(layer.id, sig);
      }
      return `${layer.id}:${sig}`;
    }).join(',');

    const mergeSignature = mergeNodes.map((node) => {
      const sig = mergeNodeRenderSig(node);
      if (import.meta.env.DEV) {
        const prev = prevMergeSigsRef.current.get(node.id);
        if (prev !== undefined && prev !== sig) {
          logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: node.id, itemKind: 'merge' });
        }
        prevMergeSigsRef.current.set(node.id, sig);
      }
      return `${node.id}:${sig}`;
    }).join(',');

    const colorSignature = colorNodes.map((node) => {
      const sig = colorNodeRenderSig(node);
      if (import.meta.env.DEV) {
        const prev = prevColorSigsRef.current.get(node.id);
        if (prev !== undefined && prev !== sig) {
          logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: node.id, itemKind: 'color' });
        }
        prevColorSigsRef.current.set(node.id, sig);
      }
      return `${node.id}:${sig}`;
    }).join(',');

    const edgeSignature = edges.map((edge) => {
      const sig = edgeRenderSig(edge);
      if (import.meta.env.DEV) {
        const prev = prevEdgeSigsRef.current.get(edge.id);
        if (prev !== undefined && prev !== sig) {
          logThumbnailInvalidation({ cause: 'graph', targetId: previewTargetId, itemId: edge.id, itemKind: 'edge' });
        }
        prevEdgeSigsRef.current.set(edge.id, sig);
      }
      return `${edge.id}:${sig}`;
    }).join(',');

    const primitiveViewSignature = layers
      .filter((layer) => layer.kind === 'primitive')
      .map((layer) => {
        const view = primitiveViewStates[layer.id];
        return view
          ? `${layer.id}:${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}`
          : `${layer.id}:default`;
      })
      .join('|');

    return [
      previewTargetId,
      `${previewSize.width}x${previewSize.height}`,
      doc.global.bg,
      doc.global.seed,
      doc.global.aspect,
      layerSignature,
      mergeSignature,
      colorSignature,
      edgeSignature,
      primitiveViewSignature,
    ].join('::');
  }, [doc.global.aspect, doc.global.bg, doc.global.seed, doc.layers, graph, previewSize, previewTargetId, primitiveViewStates]);

  const latestRef = useRef({
    doc,
    graph,
    imageCache,
    previewKey,
    previewSize,
    isExportPreview,
    previewTargetId,
    primitiveViewStates,
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
    };
  }, [doc, graph, imageCache, isExportPreview, previewKey, previewSize, previewTargetId, primitiveViewStates]);

  const [hasRendered, setHasRendered] = useState(false);
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const ready = renderedPreviewKey === previewKey;

  useEffect(() => {
    const rev = ++revRef.current;
    clearTimeout(debounceRef.current);
    const cached = thumbnailResultCache.get(previewKey);
    if (cached && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, previewSize.width, previewSize.height);
        ctx.drawImage(cached, 0, 0, previewSize.width, previewSize.height);
        setHasRendered(true);
        setRenderedPreviewKey(previewKey);
      }
      return () => undefined;
    }
    debounceRef.current = setTimeout(() => {
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
        } = latestRef.current;
        const effectiveImageCache = new Map(cachedImages);
        const upstream = collectUpstreamNodeIds(latestPreviewTargetId, g);
        const missingImageSrcs = d.layers
          .filter((layer): layer is ImageLayer => layer.kind === 'image' && upstream.has(layer.id))
          .map((layer) => layer.src)
          .filter((src) => !effectiveImageCache.has(src));

        const preloads = missingImageSrcs.map((src) => new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            cachedImages.set(src, image);
            effectiveImageCache.set(src, image);
            resolve();
          };
          image.onerror = () => resolve();
          image.src = src;
        }));

        await Promise.all(preloads);
        if (rev !== revRef.current || !canvasRef.current) return;

        let renderPromise = thumbnailInflightCache.get(pk);
        if (!renderPromise) {
          renderPromise = (async () => {
            const previewDoc: CanvasDocument = { ...d, graph: g };
            const result = latestIsExportPreview
              ? await renderDocument(
                previewDoc,
                latestPreviewSize.width,
                latestPreviewSize.height,
                effectiveImageCache,
                { primitiveViewStates: latestPrimitiveViewStates },
              )
              : await renderGraphTarget(
                previewDoc,
                g,
                latestPreviewTargetId,
                latestPreviewSize.width,
                latestPreviewSize.height,
                effectiveImageCache,
                { primitiveViewStates: latestPrimitiveViewStates },
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
        if (rev !== revRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, latestPreviewSize.width, latestPreviewSize.height);
        ctx.drawImage(result, 0, 0, latestPreviewSize.width, latestPreviewSize.height);
        setHasRendered(true);
        setRenderedPreviewKey(pk);
      });
    }, THUMB_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [imageCache, previewKey, previewSize.height, previewSize.width, previewTargetId]);

  const canvasOpacity = ready ? 1 : hasRendered ? 1 : 0;
  const showSkeleton = !ready && !hasRendered;

  return (
    <div className={`node-thumbnail${isExportPreview ? ' node-thumbnail-export' : ''}`}>
      <div
        className="node-thumbnail-frame"
        style={isExportPreview ? { width: previewSize.width, height: previewSize.height } : undefined}
      >
        <canvas
          ref={canvasRef}
          width={previewSize.width}
          height={previewSize.height}
          className="node-thumbnail-canvas"
          style={{ opacity: canvasOpacity, transition: 'opacity 0.1s ease' }}
        />
        {showSkeleton && (
          <div className="node-thumbnail-skeleton" />
        )}
      </div>
    </div>
  );
});
