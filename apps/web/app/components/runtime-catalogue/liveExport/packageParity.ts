import { createArtwork } from '../../../../../../packages/runtime/src/artwork';
import { effectRegistry } from '../../../../../../packages/runtime/src/effects/index';
import { createLiveArtwork } from '../../../../../../packages/runtime/src/liveArtwork';
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

export interface RestingOptions {
  /**
   * Draw through the package's bindings with motion allowed, at t = 0 with every input at rest, instead of as the
   * reduced-motion still. Plates and passes the bindings move go through their moving steps.
   */
  readonly live?: boolean;
}

/**
 * Compares a package's resting frame with the editor's render of its document, at the package size, with the
 * harness tolerances: pixels, or statistics when a live pass is stochastic.
 */
export async function measurePackageParity(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  livePackage: LivePackage,
  options: RestingOptions = {},
): Promise<PackageParity> {
  const { width, height } = livePackage.manifest.size;
  const editor = readPixels(await renderDocument(doc, width, height, imageCache), width, height);
  const runtime = readPixels(await renderResting(livePackage, options), width, height);
  const stochastic = livePackagePasses(livePackage.manifest).some(
    (pass) => effectRegistry.get(pass.effect)?.stochastic,
  );
  return { comparison: compareParity(editor, runtime, stochastic), editor, runtime };
}

/** The package at rest, drawn once at its own size on a canvas that keeps its pixels, once its shaders are ready. */
export async function renderResting(
  livePackage: LivePackage,
  options: RestingOptions = {},
): Promise<HTMLCanvasElement> {
  const { width, height } = livePackage.manifest.size;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const common = {
    canvas,
    livePackage,
    observeVisibility: null,
    devicePixelRatio: 1,
    maxRenderSize: Math.max(width, height),
    contextAttributes: { preserveDrawingBuffer: true },
  };
  const artwork = options.live
    ? createLiveArtwork({ ...common, reducedMotion: false, pointer: false })
    : createArtwork({ ...common, reducedMotion: true });
  try {
    await artwork.ready;
  } catch (error) {
    artwork.destroy();
    throw error;
  }
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
