/**
 * Counts render inputs that fell back because an asset was missing or failed to load (an image, environment, or
 * model asset not in the store yet, or a font that did not load). Content-keyed render caches include the count, so
 * a frame rendered with a fallback is not reused once the asset may have become available.
 */
let renderAssetEpoch = 0;

export function getRenderAssetEpoch(): number {
  return renderAssetEpoch;
}

export function markRenderAssetFallback(): void {
  renderAssetEpoch += 1;
}
