import type { ImageLayer, Layer } from '../../../types/config';
import { isAssetUri } from '../../../utils/assetStore';

export function getLiveImageSource(layer: ImageLayer, imageCache: Map<string, HTMLImageElement>) {
  if (!layer.src) return null;
  const cached = imageCache.get(layer.src);
  const cachedSource = cached?.currentSrc || cached?.src;
  const source = cachedSource || (!isAssetUri(layer.src) ? layer.src : null);
  return source && !isAssetUri(source) ? source : null;
}

export function shouldResolveLiveImageSource(layer: Layer, currentSource: string | null) {
  return layer.kind === 'image' && isAssetUri(layer.src) && currentSource === null;
}

export function shouldUseLiveMediaOverlay(input: {
  layer: Layer;
  selected: boolean;
  transformActive: boolean;
  liveImageSource?: string | null;
}) {
  const { layer, selected, transformActive, liveImageSource } = input;
  if (!selected || !transformActive) return false;
  if (layer.kind === 'text') return true;
  if (layer.kind !== 'image' || !layer.src) return false;
  return Boolean(liveImageSource);
}
