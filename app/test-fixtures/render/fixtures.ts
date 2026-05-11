/**
 * Deterministic CanvasDocument fixtures for render parity tests.
 *
 * Rules:
 * - No randomized fields — all seeds, positions, colors, and sizes are fixed.
 * - No image layers — image data URLs are not portable in test snapshots.
 * - No primitive/noise/array source layers — WebGL is not available in the
 *   Node.js test environment. Smoke-test those separately.
 * - No effect layers — GPU pass is skipped in parity tests; effect fixtures
 *   live in a separate smoke-test file.
 */

import type { CanvasDocument } from '../../types/config';
import { makeEmojiLayer, makeFillLayer, makeTextLayer } from '../../types/config';

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
