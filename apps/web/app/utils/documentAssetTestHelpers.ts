import { vi } from 'vitest';

export function makePortableAssetLoaders({
  imageRef,
  imageDataUrl,
  fontRef,
  fontAsset,
  modelRef,
  modelAsset,
  environmentRef,
  environmentAsset,
}: {
  imageRef: string;
  imageDataUrl: string;
  fontRef: string;
  fontAsset: unknown;
  modelRef?: string;
  modelAsset?: unknown;
  environmentRef?: string;
  environmentAsset?: unknown;
}) {
  return {
    loadAssetDataUrl: vi.fn(async (src: string) => (src === imageRef ? imageDataUrl : null)),
    loadFontAsset: vi.fn(async (font: string) => (font === fontRef ? fontAsset : null)),
    loadModelAsset: vi.fn(async (model: string) => (model === modelRef ? modelAsset : null)),
    loadEnvironmentAsset: vi.fn(async (environment: string) =>
      environment === environmentRef ? environmentAsset : null,
    ),
  };
}
