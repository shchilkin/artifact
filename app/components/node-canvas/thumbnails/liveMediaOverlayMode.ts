import type { Layer } from '../../../types/config';
import { isAssetUri } from '../../../utils/assetStore';

export function shouldUseLiveMediaOverlay(input: {
  layer: Layer;
  selected: boolean;
  transformActive: boolean;
  imageReady: boolean;
}) {
  const { layer, selected, transformActive, imageReady } = input;
  if (!selected || !transformActive) return false;
  if (layer.kind === 'text') return true;
  if (layer.kind !== 'image' || !layer.src) return false;
  return !isAssetUri(layer.src) || imageReady;
}
