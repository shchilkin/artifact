import { ASPECT_SIZES, type CanvasDocument } from '../types/config';
import { hashString } from './hashString';
import { type GraphRenderCache, renderDocument } from './renderer';

export const PROJECT_THUMBNAIL_MIN_EDGE = 1080;
const THUMB_MIME = 'image/webp';
const THUMB_QUALITY = 0.94;
const THUMBNAIL_DATA_URL_CACHE_LIMIT = 64;
const THUMBNAIL_GRAPH_RENDER_CACHE_LIMIT = 128;
const thumbnailDataUrlCache = new Map<string, string>();
const thumbnailDataUrlInflightCache = new Map<string, Promise<string>>();
const thumbnailGraphRenderCache = new Map<string, Promise<HTMLCanvasElement>>();

function imageCacheSignature(doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>) {
  return doc.layers
    .filter((layer) => layer.kind === 'image')
    .map((layer) => {
      const image = imageCache.get(layer.src);
      return `${layer.id}:${hashString(layer.src)}:${image ? `${image.naturalWidth}x${image.naturalHeight}` : 'missing'}`;
    })
    .join(',');
}

function rememberThumbnailDataUrl(key: string, value: string) {
  thumbnailDataUrlCache.delete(key);
  thumbnailDataUrlCache.set(key, value);
  while (thumbnailDataUrlCache.size > THUMBNAIL_DATA_URL_CACHE_LIMIT) {
    const oldestKey = thumbnailDataUrlCache.keys().next().value;
    if (!oldestKey) break;
    thumbnailDataUrlCache.delete(oldestKey);
  }
}

export function projectThumbnailDimensions(doc: CanvasDocument) {
  const aspect = doc.global?.aspect ?? '1:1';
  const [aw, ah] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  const scale = PROJECT_THUMBNAIL_MIN_EDGE / Math.min(aw, ah);
  return {
    aspect,
    width: Math.max(1, Math.round(aw * scale)),
    height: Math.max(1, Math.round(ah * scale)),
  };
}

function thumbnailCacheKey(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  dimensions: ReturnType<typeof projectThumbnailDimensions>,
) {
  return hashString(
    JSON.stringify({
      aspect: dimensions.aspect,
      W: dimensions.width,
      H: dimensions.height,
      doc,
      images: imageCacheSignature(doc, imageCache),
    }),
  );
}

async function renderThumbnailDataUrl(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  cacheKey: string,
  width: number,
  height: number,
) {
  const graphRenderCache: GraphRenderCache = {
    namespace: cacheKey,
    entries: thumbnailGraphRenderCache,
    limit: THUMBNAIL_GRAPH_RENDER_CACHE_LIMIT,
  };
  const out = await renderDocument(
    doc,
    width,
    height,
    imageCache,
    { effectResolution: { width, height } },
    graphRenderCache,
  );
  const result = out.toDataURL(THUMB_MIME, THUMB_QUALITY);
  rememberThumbnailDataUrl(cacheKey, result);
  return result;
}

export async function generateThumbnail(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
): Promise<string> {
  const dimensions = projectThumbnailDimensions(doc);
  const cacheKey = thumbnailCacheKey(doc, imageCache, dimensions);
  const cached = thumbnailDataUrlCache.get(cacheKey);
  if (cached) return cached;

  let inflight = thumbnailDataUrlInflightCache.get(cacheKey);
  if (!inflight) {
    inflight = renderThumbnailDataUrl(doc, imageCache, cacheKey, dimensions.width, dimensions.height);
    thumbnailDataUrlInflightCache.set(cacheKey, inflight);
    inflight.finally(() => {
      if (thumbnailDataUrlInflightCache.get(cacheKey) === inflight) thumbnailDataUrlInflightCache.delete(cacheKey);
    });
  }

  return inflight;
}
