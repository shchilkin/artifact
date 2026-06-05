import type { ImageLayer } from '../types/config';

export function imageCacheSignature(layers: ImageLayer[], imageCache: Map<string, HTMLImageElement>) {
  return layers
    .map((layer) => {
      const image = imageCache.get(layer.src);
      return `${layer.id}:${layer.src}:${image ? `${image.naturalWidth}x${image.naturalHeight}` : 'missing'}`;
    })
    .join(',');
}
