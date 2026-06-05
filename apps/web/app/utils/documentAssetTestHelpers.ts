import { vi } from 'vitest';

export function makePortableAssetLoaders({
  imageRef,
  imageDataUrl,
  fontRef,
  fontAsset,
}: {
  imageRef: string;
  imageDataUrl: string;
  fontRef: string;
  fontAsset: unknown;
}) {
  return {
    loadAssetDataUrl: vi.fn(async (src: string) => (src === imageRef ? imageDataUrl : null)),
    loadFontAsset: vi.fn(async (font: string) => (font === fontRef ? fontAsset : null)),
  };
}
