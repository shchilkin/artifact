import { createArtwork } from '../../../../../../packages/runtime/src/artwork';
import { effectRegistry } from '../../../../../../packages/runtime/src/effects/index';
import { type LivePackage, livePackagePasses } from '../../../../../../packages/runtime/src/livePackage';
import {
  compareParity,
  type ParityComparison,
  type RgbaImage,
} from '../../../../../../packages/runtime/src/testing/parity';
import type { CanvasDocument } from '../../../types/config';
import { renderDocument } from '../../../utils/renderer';

export interface PackageParity {
  readonly comparison: ParityComparison;
  /** The editor's render of the document at the package size. */
  readonly editor: RgbaImage;
  /** The package's resting frame in the runtime at the same size. */
  readonly runtime: RgbaImage;
}

/**
 * Compares a package's resting frame with the editor's render of its document, at the package size, with the
 * harness tolerances: pixels, or statistics when a live pass is stochastic.
 */
export async function measurePackageParity(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  livePackage: LivePackage,
): Promise<PackageParity> {
  const { width, height } = livePackage.manifest.size;
  const editor = readPixels(await renderDocument(doc, width, height, imageCache), width, height);
  const runtime = readPixels(renderResting(livePackage), width, height);
  const stochastic = livePackagePasses(livePackage.manifest).some(
    (pass) => effectRegistry.get(pass.effect)?.stochastic,
  );
  return { comparison: compareParity(editor, runtime, stochastic), editor, runtime };
}

/** The package at rest, drawn once at its own size on a canvas that keeps its pixels. */
export function renderResting(livePackage: LivePackage): HTMLCanvasElement {
  const { width, height } = livePackage.manifest.size;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const artwork = createArtwork({
    canvas,
    livePackage,
    reducedMotion: true,
    observeVisibility: null,
    devicePixelRatio: 1,
    maxRenderSize: Math.max(width, height),
    contextAttributes: { preserveDrawingBuffer: true },
  });
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  copy.getContext('2d')?.drawImage(canvas, 0, 0);
  artwork.destroy();
  return copy;
}

export function readPixels(source: CanvasImageSource, width: number, height: number): RgbaImage {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable.');
  ctx.drawImage(source, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}
