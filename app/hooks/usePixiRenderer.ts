import { useMemo } from 'react';
import type { GeneratorConfig } from '../types/config';
import { migrateFromV1 } from '../types/config';
import { useDocumentRenderer } from './useDocumentRenderer';

export function usePixiRenderer(
  cfg: GeneratorConfig,
  seed: number,
  bgImage: HTMLImageElement | null = null,
) {
  void bgImage;
  const doc = useMemo(() => migrateFromV1(seed, cfg as unknown as Record<string, unknown>), [cfg, seed]);
  return useDocumentRenderer(doc, new Map());
}
