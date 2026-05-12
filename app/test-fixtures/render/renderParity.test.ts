/**
 * Render parity fixtures — Phase 5.
 *
 * Goals:
 * 1. Prove that renderDocument produces output with the correct dimensions.
 * 2. Prove that a fill-only render is deterministic and covers the canvas.
 * 3. Prove that rendering the same scene at two sizes produces proportionally
 *    identical centre pixels (preview/export size parity).
 * 4. Prove that the emoji layer is seeded: two renders with the same seed match.
 * 5. Prove that the stack-mode and inferred-linear-graph modes produce the same output.
 *
 * GPU/WebGL effect passes and primitive source layers need a WebGL context that
 * is unavailable in Node. Those are covered by separate smoke tests at the
 * bottom of this file.
 *
 * Canvas 2D is available via the @napi-rs/canvas polyfill registered in
 * canvasPolyfill.ts (included through vitest setupFiles).
 */

import { describe, expect, it } from 'vitest';
import { type CanvasDocument, makeEffectPresetLayer, makeFillLayer, makeSourceLayer } from '../../types/config';
import { renderDocument } from '../../utils/renderer';
import { emojiSeeded, fillOnly, textOverFill } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sample a single pixel (x, y) from a rendered canvas. Returns [r, g, b, a]. */
function samplePixel(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0], data[1], data[2], data[3]];
}

/** Extract every pixel as a flat Uint8ClampedArray. */
function allPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Check that two Uint8ClampedArrays are identical. */
function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function alphaBounds(canvas: HTMLCanvasElement): { width: number; height: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3] ?? 0;
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    width: Math.max(0, maxX - minX + 1),
    height: Math.max(0, maxY - minY + 1),
  };
}

/**
 * Sample the centre pixel of a canvas rendered from `doc` at the given size.
 * Uses stack mode and skips GPU effects to keep tests deterministic.
 */
async function renderCentre(doc: Parameters<typeof renderDocument>[0], size: number) {
  const canvas = await renderDocument(doc, size, size, new Map(), {
    skipEffects: true,
    graphMode: 'stack',
  });
  return samplePixel(canvas, Math.floor(size / 2), Math.floor(size / 2));
}

// ---------------------------------------------------------------------------
// Output dimensions
// ---------------------------------------------------------------------------

describe('renderDocument — output dimensions', () => {
  it('returns a canvas whose dimensions match the requested W × H', async () => {
    const canvas = await renderDocument(fillOnly, 200, 200, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(200);
  });

  it('supports non-square output', async () => {
    const canvas = await renderDocument(fillOnly, 300, 400, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Fill layer — coverage and colour
// ---------------------------------------------------------------------------

describe('renderDocument — fill-only document', () => {
  it('produces a fully opaque canvas (alpha = 255 everywhere)', async () => {
    const canvas = await renderDocument(fillOnly, 100, 100, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const pixels = allPixels(canvas);
    // Sample every alpha channel byte (index 3, 7, 11, …)
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });

  it('the center pixel has red as the dominant channel (fill colour #e94560)', async () => {
    // #e94560 → approximately rgb(233, 69, 96). The background gradient darkens
    // slightly at centre but the fill is fully opaque, so red still dominates.
    const [r, , b] = await renderCentre(fillOnly, 100);
    expect(r).toBeGreaterThan(b);
  });

  it('is deterministic: two renders of the same document produce identical pixels', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const a = await renderDocument(fillOnly, 100, 100, new Map(), opts);
    const b = await renderDocument(fillOnly, 100, 100, new Map(), opts);
    expect(pixelsEqual(allPixels(a), allPixels(b))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Text layer
// ---------------------------------------------------------------------------

describe('renderDocument — text over fill', () => {
  it('returns a canvas with correct dimensions', async () => {
    const canvas = await renderDocument(textOverFill, 100, 100, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
  });

  it('produces a fully opaque canvas', async () => {
    const canvas = await renderDocument(textOverFill, 100, 100, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const pixels = allPixels(canvas);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });

  it('is deterministic across renders', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const a = await renderDocument(textOverFill, 100, 100, new Map(), opts);
    const b = await renderDocument(textOverFill, 100, 100, new Map(), opts);
    expect(pixelsEqual(allPixels(a), allPixels(b))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Emoji — seed determinism
// ---------------------------------------------------------------------------

describe('renderDocument — emoji seeded determinism', () => {
  it('two renders with the same doc.global.seed produce identical pixels', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const a = await renderDocument(emojiSeeded, 100, 100, new Map(), opts);
    const b = await renderDocument(emojiSeeded, 100, 100, new Map(), opts);
    expect(pixelsEqual(allPixels(a), allPixels(b))).toBe(true);
  });

  it('a different seed produces different pixels', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const docA = emojiSeeded;
    const docB = { ...emojiSeeded, global: { ...emojiSeeded.global, seed: 999 } };
    const a = await renderDocument(docA, 100, 100, new Map(), opts);
    const b = await renderDocument(docB, 100, 100, new Map(), opts);
    expect(pixelsEqual(allPixels(a), allPixels(b))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preview / export size parity
// ---------------------------------------------------------------------------

describe('renderDocument — preview/export size parity', () => {
  it('fill-only: centre pixel is identical at 100 × 100 and 200 × 200', async () => {
    // A fill layer covers the entire canvas. The background gradient is radial
    // so the centre is always the same colour regardless of canvas size.
    // The fill overwrites everything, so the centre should be identical.
    const small = await renderCentre(fillOnly, 100);
    const large = await renderCentre(fillOnly, 200);
    expect(small).toEqual(large);
  });

  it('stack mode and inferred linear graph produce the same fill-only output', async () => {
    // graphMode: 'stack' and graphMode: 'auto' (which uses inferLinearGraph)
    // should produce the same pixels for a document without a saved graph.
    const stack = await renderDocument(fillOnly, 100, 100, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const auto = await renderDocument(fillOnly, 100, 100, new Map(), {
      skipEffects: true,
      graphMode: 'auto',
    });
    expect(pixelsEqual(allPixels(stack), allPixels(auto))).toBe(true);
  });

  it('primitive full-frame sources scale proportionally at export sizes', async () => {
    const primitiveDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [
        makeSourceLayer('primitive', {
          color: '#ff5a36',
          accentColor: '#ffb199',
          opacity: 100,
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const preview = await renderDocument(primitiveDoc, 540, 540, new Map(), {
      draft: true,
      skipEffects: true,
      graphMode: 'stack',
    });
    const exported = await renderDocument(primitiveDoc, 1080, 1080, new Map(), {
      draft: true,
      skipEffects: true,
      graphMode: 'stack',
    });
    const previewBounds = alphaBounds(preview);
    const exportedBounds = alphaBounds(exported);

    expect(exportedBounds.width).toBeGreaterThan(0);
    expect(exportedBounds.height).toBeGreaterThan(0);
    expect(exportedBounds.width).toBeCloseTo(previewBounds.width * 2, -1);
    expect(exportedBounds.height).toBeCloseTo(previewBounds.height * 2, -1);
  });

  it('effect resolution locking preserves scale-one scanline texture in larger exports', async () => {
    const effectDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [
        makeFillLayer({
          color: '#ff5a36',
          opacity: 100,
        }),
        makeEffectPresetLayer('scanlines', { scanlines: 80 }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const base = await renderDocument(effectDoc, 100, 100, new Map(), {
      draft: true,
      graphMode: 'stack',
    });
    const scaled = await renderDocument(effectDoc, 200, 200, new Map(), {
      draft: true,
      graphMode: 'stack',
      effectResolution: { width: 100, height: 100 },
    });

    for (let y = 0; y < 100; y += 5) {
      for (let x = 0; x < 100; x += 5) {
        expect(samplePixel(scaled, x * 2, y * 2)).toEqual(samplePixel(base, x, y));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Smoke tests — ensure render completes without throwing
// These do NOT assert pixel values; they only verify the pipeline runs.
// ---------------------------------------------------------------------------

describe('renderDocument — smoke: render completes', () => {
  it('fill-only at 540 × 540 completes and returns correct size', async () => {
    const canvas = await renderDocument(fillOnly, 540, 540, new Map(), {
      skipEffects: true,
    });
    expect(canvas.width).toBe(540);
    expect(canvas.height).toBe(540);
  });

  it('text over fill at 1080 × 1080 (export size) completes', async () => {
    const canvas = await renderDocument(textOverFill, 1080, 1080, new Map(), {
      skipEffects: true,
    });
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
  });
});
