import { ASPECT_SIZES, type CanvasDocument } from '../types/config';
import { hashString } from './hashString';
import { type GraphRenderCache, renderDocument } from './renderer';

const THUMB_LONG_EDGE = 360;
const THUMB_QUALITY = 0.86;
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

export async function generateThumbnail(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
): Promise<string> {
  const aspect = doc.global?.aspect ?? '1:1';
  const [aw, ah] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  const longest = Math.max(aw, ah);
  const scale = THUMB_LONG_EDGE / longest;
  const W = Math.max(1, Math.round(aw * scale));
  const H = Math.max(1, Math.round(ah * scale));
  const cacheKey = hashString(
    JSON.stringify({
      aspect,
      W,
      H,
      doc,
      images: imageCacheSignature(doc, imageCache),
    }),
  );
  const cached = thumbnailDataUrlCache.get(cacheKey);
  if (cached) return cached;

  let inflight = thumbnailDataUrlInflightCache.get(cacheKey);
  if (!inflight) {
    inflight = (async () => {
      const graphRenderCache: GraphRenderCache = {
        namespace: cacheKey,
        entries: thumbnailGraphRenderCache,
        limit: THUMBNAIL_GRAPH_RENDER_CACHE_LIMIT,
      };
      const out = await renderDocument(
        doc,
        W,
        H,
        imageCache,
        { effectResolution: { width: W, height: H } },
        graphRenderCache,
      );
      const result = out.toDataURL('image/jpeg', THUMB_QUALITY);
      rememberThumbnailDataUrl(cacheKey, result);
      return result;
    })();
    thumbnailDataUrlInflightCache.set(cacheKey, inflight);
    inflight.finally(() => {
      if (thumbnailDataUrlInflightCache.get(cacheKey) === inflight) thumbnailDataUrlInflightCache.delete(cacheKey);
    });
  }

  return inflight;
}
