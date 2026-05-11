import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CanvasDocument, ImageLayer } from '../../../types/config';
import { ASPECT_SIZES } from '../../../types/config';
import { renderDocument, renderGraphTarget } from '../../../utils/renderer';
import { EXPORT_NODE_ID, collectUpstreamNodeIds } from '../../../utils/nodeGraph';
import { useNodeCanvasPreview } from '../context';
import { THUMB_SIZE } from '../constants';
import type { ThumbProps } from '../types';
import { scheduleThumbnailRender, THUMB_DEBOUNCE_MS } from './thumbnailQueue';

const THUMBNAIL_CACHE_LIMIT = 48;
const thumbnailResultCache = new Map<string, HTMLCanvasElement>();
const thumbnailInflightCache = new Map<string, Promise<HTMLCanvasElement>>();

type RevisionEntry<T> = {
  value: T;
  rev: number;
};

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

function updateRevisionMap<T extends { id: string }>(
  previous: Map<string, RevisionEntry<T>>,
  items: T[],
) {
  const next = new Map<string, RevisionEntry<T>>();
  for (const item of items) {
    const prior = previous.get(item.id);
    next.set(
      item.id,
      prior?.value === item
        ? prior
        : { value: item, rev: (prior?.rev ?? 0) + 1 },
    );
  }
  return next;
}

export const NodeThumbnail = memo(function NodeThumbnail({ previewTargetId }: ThumbProps) {
  const { doc, graph, imageCache, primitiveViewStates } = useNodeCanvasPreview();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const layerRevisionsRef = useRef<Map<string, RevisionEntry<CanvasDocument['layers'][number]>>>(new Map());
  const mergeRevisionsRef = useRef<Map<string, RevisionEntry<(typeof graph.mergeNodes)[number]>>>(new Map());
  const colorRevisionsRef = useRef<Map<string, RevisionEntry<NonNullable<typeof graph.colorNodes>[number]>>>(new Map());
  const edgeRevisionsRef = useRef<Map<string, RevisionEntry<(typeof graph.edges)[number]>>>(new Map());
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
    layerRevisionsRef.current = updateRevisionMap(layerRevisionsRef.current, doc.layers);
    mergeRevisionsRef.current = updateRevisionMap(mergeRevisionsRef.current, graph.mergeNodes);
    colorRevisionsRef.current = updateRevisionMap(colorRevisionsRef.current, graph.colorNodes ?? []);
    edgeRevisionsRef.current = updateRevisionMap(edgeRevisionsRef.current, graph.edges);

    const layerSignature = layers
      .map((layer) => `${layer.id}:${layerRevisionsRef.current.get(layer.id)?.rev ?? 0}`)
      .join(',');
    const mergeSignature = mergeNodes
      .map((node) => `${node.id}:${mergeRevisionsRef.current.get(node.id)?.rev ?? 0}`)
      .join(',');
    const colorSignature = colorNodes
      .map((node) => `${node.id}:${colorRevisionsRef.current.get(node.id)?.rev ?? 0}`)
      .join(',');
    const edgeSignature = edges
      .map((edge) => `${edge.id}:${edgeRevisionsRef.current.get(edge.id)?.rev ?? 0}`)
      .join(',');
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
