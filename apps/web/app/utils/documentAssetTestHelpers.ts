import { vi } from 'vitest';

import type { PortableEnvironmentAsset, PortableModelAsset } from '../types/config';
import type { ImportedFontAsset } from './fontStore';

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
  fontAsset: ImportedFontAsset;
  modelRef?: string;
  modelAsset?: PortableModelAsset;
  environmentRef?: string;
  environmentAsset?: PortableEnvironmentAsset;
}) {
  return {
    loadAssetDataUrl: vi.fn(async (src: string) => (src === imageRef ? imageDataUrl : null)),
    loadFontAsset: vi.fn(async (font: string) => (font === fontRef ? fontAsset : null)),
    loadModelAsset: vi.fn(async (model: string) => (model === modelRef ? (modelAsset ?? null) : null)),
    loadEnvironmentAsset: vi.fn(async (environment: string) =>
      environment === environmentRef ? (environmentAsset ?? null) : null,
    ),
  };
}
