/**
 * Deterministic CanvasDocument fixtures for render parity tests.
 *
 * Rules:
 * - No randomized fields — all seeds, positions, colors, and sizes are fixed.
 * - Image fixtures use a generated in-memory canvas cache, not external files.
 * - Procedural source fixtures stay on deterministic Canvas 2D paths.
 * - Primitive source fixtures use draft fallback in tests because WebGL is not
 *   available in the Node.js test environment.
 * - No effect layers — GPU pass is skipped in parity tests; effect fixtures
 *   live in a separate smoke-test file.
 */

import type { CanvasDocument } from '../../types/config';
import { makeEmojiLayer, makeFillLayer, makeImageLayer, makeSourceLayer, makeTextLayer } from '../../types/config';
import { measureAlphaBounds } from '../../utils/render/alphaBounds';

const TEST_IMAGE_SRC = 'test-cache://free-fit-source';

/** Solid fill with a fixed background colour. Used to verify baseline coverage. */
export const fillOnly: CanvasDocument = {
  global: { bg: '#1a1a2e', seed: 1, aspect: '1:1' },
  layers: [makeFillLayer({ id: 'fill-1', color: '#e94560', opacity: 100, blendMode: 'normal' })],
  export: { format: 'png', scale: 1, target: 'cover' },
};

/** Text centred over a fill — exercises text rendering path. */
export const textOverFill: CanvasDocument = {
  global: { bg: '#0f3460', seed: 2, aspect: '1:1' },
  layers: [
    makeFillLayer({ id: 'fill-2', color: '#16213e', opacity: 100, blendMode: 'normal' }),
    makeTextLayer({
      id: 'text-1',
      content: 'ARTIFACT',
      size: 80,
      color: '#ffffff',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
      opacity: 100,
      blendMode: 'normal',
    }),
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

/**
 * Emoji scattered with a fixed seed.
 * Determinism is provided by the global.seed value —
 * the same seed always produces the same layout.
 */
export const emojiSeeded: CanvasDocument = {
  global: { bg: '#2d132c', seed: 42, aspect: '1:1' },
  layers: [
    makeFillLayer({ id: 'fill-3', color: '#1b1b2f', opacity: 100, blendMode: 'normal' }),
    makeEmojiLayer({
      id: 'emoji-1',
      emojis: ['🌊'],
      density: 20,
      minSz: 24,
      maxSz: 48,
      blur: 0,
      opacity: 100,
      blendMode: 'normal',
    }),
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

/** Free-fit image with transparent background — exercises image transform sizing. */
export const imageFreeFit: CanvasDocument = {
  global: { bg: 'transparent', seed: 7, aspect: '1:1' },
  layers: [
    makeImageLayer(TEST_IMAGE_SRC, {
      id: 'image-free-fit-1',
      fit: 'free',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }),
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

/** Procedural noise over transparency — stable Canvas 2D source path. */
export const proceduralNoise: CanvasDocument = {
  global: { bg: 'transparent', seed: 11, aspect: '1:1' },
  layers: [
    makeSourceLayer('noise', {
      id: 'noise-source-1',
      color: '#112244',
      accentColor: '#f2d16b',
      noiseType: 'value',
      noiseScale: 32,
      noiseDetail: 3,
      noiseContrast: 58,
      noiseBalance: 38,
      opacity: 100,
      blendMode: 'normal',
    }),
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

/** Procedural array over transparency — deterministic geometry source path. */
export const proceduralArray: CanvasDocument = {
  global: { bg: 'transparent', seed: 13, aspect: '1:1' },
  layers: [
    makeSourceLayer('array', {
      id: 'array-source-1',
      color: '#23b5d3',
      accentColor: '#f72585',
      arrayPattern: 'grid',
      arrayShape: 'diamond',
      arrayCount: 5,
      arrayRows: 4,
      arrayGap: 72,
      arraySize: 24,
      arrayJitter: 0,
      opacity: 100,
      blendMode: 'normal',
    }),
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

export function createTestImageCache(): Map<string, HTMLImageElement> {
  const image = document.createElement('canvas');
  image.width = 80;
  image.height = 40;

  const ctx = image.getContext('2d');
  if (!ctx) throw new Error('getContext returned null');
  ctx.fillStyle = '#24c8ff';
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.fillStyle = '#f72585';
  ctx.fillRect(0, 0, 20, image.height);

  Object.defineProperties(image, {
    naturalWidth: { value: image.width },
    naturalHeight: { value: image.height },
  });

  return new Map([[TEST_IMAGE_SRC, image as unknown as HTMLImageElement]]);
}

/** Sample a single pixel (x, y) from a rendered canvas. Returns [r, g, b, a]. */
export function samplePixel(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0], data[1], data[2], data[3]];
}

export function centerPixel(canvas: HTMLCanvasElement) {
  return samplePixel(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
}

/** Extract every pixel as a flat Uint8ClampedArray. */
export function allPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Check that two Uint8ClampedArrays are identical. */
export function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function alphaBounds(canvas: HTMLCanvasElement): { width: number; height: number } {
  const bounds = measureAlphaBounds(canvas);
  return bounds ? { width: bounds.width, height: bounds.height } : { width: 0, height: 0 };
}
