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
import {
  type CanvasDocument,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeSourceLayer,
} from '../../types/config';
import { renderDocument } from '../../utils/renderer';
import {
  allPixels,
  alphaBounds,
  createTestImageCache,
  emojiSeeded,
  fillOnly,
  imageFreeFit,
  pixelsEqual,
  proceduralArray,
  proceduralNoise,
  samplePixel,
  textOverFill,
} from './fixtures';

function visiblePixelCount(canvas: HTMLCanvasElement): number {
  const pixels = allPixels(canvas);
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if ((pixels[i] ?? 0) > 8) count += 1;
  }
  return count;
}

async function renderStackDocument(doc: CanvasDocument, size: number, skipEffects = true) {
  return renderDocument(doc, size, size, new Map(), {
    skipEffects,
    graphMode: 'stack',
  });
}

function expectBoundsScale(preview: HTMLCanvasElement, exported: HTMLCanvasElement) {
  const previewBounds = alphaBounds(preview);
  const exportedBounds = alphaBounds(exported);
  expect(exportedBounds.width).toBeCloseTo(previewBounds.width * 2, -1);
  expect(exportedBounds.height).toBeCloseTo(previewBounds.height * 2, -1);
}

async function expectSeedOffsetChangesPixels(
  makeDoc: (seedOffset: number) => CanvasDocument,
  size: number,
  skipEffects: boolean,
) {
  const first = await renderStackDocument(makeDoc(0), size, skipEffects);
  const firstAgain = await renderStackDocument(makeDoc(0), size, skipEffects);
  const varied = await renderStackDocument(makeDoc(17), size, skipEffects);
  expect(pixelsEqual(allPixels(first), allPixels(firstAgain))).toBe(true);
  expect(pixelsEqual(allPixels(first), allPixels(varied))).toBe(false);
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

function expectFullyOpaqueCanvas(canvas: HTMLCanvasElement) {
  const pixels = allPixels(canvas);
  for (let i = 3; i < pixels.length; i += 4) {
    expect(pixels[i]).toBe(255);
  }
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
    expectFullyOpaqueCanvas(canvas);
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
    expectFullyOpaqueCanvas(canvas);
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

  it('a different emoji seed offset produces different pixels without changing the document seed', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const docA = emojiSeeded;
    const docB: CanvasDocument = {
      ...emojiSeeded,
      layers: emojiSeeded.layers.map((layer) =>
        layer.kind === 'emoji' ? makeEmojiLayer({ ...layer, seedOffset: 42 }) : layer,
      ),
    };

    const a = await renderDocument(docA, 100, 100, new Map(), opts);
    const b = await renderDocument(docB, 100, 100, new Map(), opts);

    expect(docA.global.seed).toBe(docB.global.seed);
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

  it('image free-fit sources scale proportionally at export sizes', async () => {
    const preview = await renderDocument(imageFreeFit, 540, 540, createTestImageCache(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const exported = await renderDocument(imageFreeFit, 1080, 1080, createTestImageCache(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    const previewBounds = alphaBounds(preview);
    const exportedBounds = alphaBounds(exported);

    expect(previewBounds).toEqual({ width: 80, height: 40 });
    expect(exportedBounds).toEqual({ width: 160, height: 80 });
    expect(samplePixel(preview, 270, 270)).toEqual([36, 200, 255, 255]);
    expect(samplePixel(exported, 540, 540)).toEqual([36, 200, 255, 255]);
  });

  it('procedural noise is deterministic and fills the same relative frame', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const previewA = await renderDocument(proceduralNoise, 108, 108, new Map(), opts);
    const previewB = await renderDocument(proceduralNoise, 108, 108, new Map(), opts);
    const exported = await renderDocument(proceduralNoise, 216, 216, new Map(), opts);

    expect(pixelsEqual(allPixels(previewA), allPixels(previewB))).toBe(true);
    expect(visiblePixelCount(previewA)).toBeGreaterThan(108 * 108 * 0.3);
    expect(alphaBounds(exported).width).toBeCloseTo(alphaBounds(previewA).width * 2, 0);
    expect(alphaBounds(exported).height).toBeCloseTo(alphaBounds(previewA).height * 2, 0);
  });

  it('procedural noise scale supports fine grain below the old coarse minimum', async () => {
    const makeNoiseDoc = (noiseScale: number): CanvasDocument => ({
      global: { bg: 'transparent', seed: 7, aspect: '1:1' },
      layers: [
        makeSourceLayer('noise', {
          noiseType: 'value',
          noiseScale,
          noiseDetail: 2,
          noiseContrast: 60,
          noiseBalance: 50,
          color: '#000000',
          accentColor: '#ffffff',
          opacity: 100,
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });
    const fine = await renderDocument(makeNoiseDoc(2), 128, 128, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const coarse = await renderDocument(makeNoiseDoc(6), 128, 128, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    expect(pixelsEqual(allPixels(fine), allPixels(coarse))).toBe(false);
    expect(visiblePixelCount(fine)).toBeGreaterThan(128 * 128 * 0.25);
  });

  it('procedural arrays are deterministic and scale proportionally at export sizes', async () => {
    const opts = { skipEffects: true as const, graphMode: 'stack' as const };
    const previewA = await renderDocument(proceduralArray, 540, 540, new Map(), opts);
    const previewB = await renderDocument(proceduralArray, 540, 540, new Map(), opts);
    const exported = await renderDocument(proceduralArray, 1080, 1080, new Map(), opts);

    expect(pixelsEqual(allPixels(previewA), allPixels(previewB))).toBe(true);
    expect(visiblePixelCount(previewA)).toBeGreaterThan(1000);
    expectBoundsScale(previewA, exported);
  });

  it('radial array gap expands rings instead of only changing inspector state', async () => {
    const makeRadialDoc = (gap: number): CanvasDocument => ({
      global: { bg: 'transparent', seed: 13, aspect: '1:1' },
      layers: [
        makeSourceLayer('array', {
          arrayPattern: 'radial',
          arrayShape: 'disc',
          arrayCount: 10,
          arrayRows: 4,
          arrayRadius: 24,
          arrayGap: gap,
          arraySize: 8,
          arrayJitter: 0,
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });
    const tight = await renderDocument(makeRadialDoc(12), 320, 320, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const wide = await renderDocument(makeRadialDoc(52), 320, 320, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    expect(alphaBounds(wide).width).toBeGreaterThan(alphaBounds(tight).width + 80);
    expect(alphaBounds(wide).height).toBeGreaterThan(alphaBounds(tight).height + 80);
  });

  it('barcode line rows and width controls affect rendered geometry', async () => {
    const makeBarcodeDoc = (rows: number, barWidth: number): CanvasDocument => ({
      global: { bg: 'transparent', seed: 21, aspect: '1:1' },
      layers: [
        makeSourceLayer('array', {
          arrayPattern: 'line',
          arrayShape: 'bar',
          arrayCount: 6,
          arrayRows: rows,
          arrayGap: 48,
          arrayRadius: barWidth,
          arraySize: 54,
          arrayJitter: 0,
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });

    const singleRow = await renderDocument(makeBarcodeDoc(1, 8), 320, 320, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const threeRows = await renderDocument(makeBarcodeDoc(3, 8), 320, 320, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const wideBars = await renderDocument(makeBarcodeDoc(1, 32), 320, 320, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    expect(alphaBounds(threeRows).height).toBeGreaterThan(alphaBounds(singleRow).height + 60);
    expect(visiblePixelCount(wideBars)).toBeGreaterThan(visiblePixelCount(singleRow) * 2.5);
  });

  it('line field renders nonblank output across common aspect ratios', async () => {
    const makeLineDoc = (aspect: CanvasDocument['global']['aspect']): CanvasDocument => ({
      global: { bg: 'transparent', seed: 33, aspect },
      layers: [
        makeSourceLayer('lineField', {
          lineFieldOrientation: 'diagonal',
          lineFieldDistortion: 'wave',
          lineFieldCount: 24,
          lineFieldSpacing: 18,
          lineFieldStroke: 3,
          lineFieldStrength: 32,
          lineFieldFrequency: 4,
          color: '#ffffff',
          accentColor: '#ffffff',
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });

    for (const [aspect, width, height] of [
      ['1:1', 120, 120],
      ['4:5', 120, 150],
      ['9:16', 90, 160],
      ['16:9', 160, 90],
    ] as const) {
      const canvas = await renderDocument(makeLineDoc(aspect), width, height, new Map(), {
        skipEffects: true,
        graphMode: 'stack',
      });

      expect(visiblePixelCount(canvas)).toBeGreaterThan(width * height * 0.05);
    }
  });

  it('line field ignores placement scale and still covers the frame', async () => {
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 34, aspect: '1:1' },
      layers: [
        makeSourceLayer('lineField', {
          x: 0.25,
          y: 0.25,
          scaleX: 0.25,
          scaleY: 0.25,
          rotation: 28,
          lineFieldOrientation: 'horizontal',
          lineFieldDistortion: 'none',
          lineFieldCount: 80,
          lineFieldSpacing: 12,
          lineFieldStroke: 4,
          color: '#ffffff',
          accentColor: '#ffffff',
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderDocument(doc, 160, 160, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });
    const bounds = alphaBounds(canvas);

    expect(bounds.width).toBeGreaterThan(150);
    expect(bounds.height).toBeGreaterThan(150);
  });

  it('procedural source seed offsets vary one node without changing the document seed', async () => {
    const makeNoiseDoc = (seedOffset: number): CanvasDocument => ({
      global: { bg: 'transparent', seed: 42, aspect: '1:1' },
      layers: [
        makeSourceLayer('noise', {
          noiseType: 'value',
          noiseScale: 12,
          noiseDetail: 3,
          noiseContrast: 78,
          noiseBalance: 36,
          seedOffset,
          color: '#050505',
          accentColor: '#f8f8f0',
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });

    await expectSeedOffsetChangesPixels(makeNoiseDoc, 160, true);
  });

  it('effect seed offsets vary one effect node without changing the document seed', async () => {
    const makeEffectDoc = (seedOffset: number): CanvasDocument => ({
      global: { bg: '#111111', seed: 42, aspect: '1:1' },
      layers: [
        makeFillLayer({ color: '#777777', opacity: 100 }),
        makeEffectPresetLayer('grain', {
          grain: 60,
          seedOffset,
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });

    await expectSeedOffsetChangesPixels(makeEffectDoc, 120, false);
  });

  it('noise shaping controls alter procedural texture pixels deterministically', async () => {
    const makeNoiseDoc = (patch: Partial<ReturnType<typeof makeSourceLayer>> = {}): CanvasDocument => ({
      global: { bg: 'transparent', seed: 77, aspect: '1:1' },
      layers: [
        makeSourceLayer('noise', {
          noiseType: 'clouds',
          noiseScale: 18,
          noiseDetail: 5,
          noiseContrast: 52,
          noiseBalance: 45,
          color: '#040405',
          accentColor: '#e9e2d4',
          ...patch,
        }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    });
    const options = { skipEffects: true, graphMode: 'stack' as const };
    const size = 120;

    const base = await renderDocument(makeNoiseDoc(), size, size, new Map(), options);
    const shaped = await renderDocument(
      makeNoiseDoc({ noiseWarp: 70, noiseTurbulence: 62, noiseThreshold: 48 }),
      size,
      size,
      new Map(),
      options,
    );
    const shapedAgain = await renderDocument(
      makeNoiseDoc({ noiseWarp: 70, noiseTurbulence: 62, noiseThreshold: 48 }),
      size,
      size,
      new Map(),
      options,
    );

    expect(pixelsEqual(allPixels(shaped), allPixels(shapedAgain))).toBe(true);
    expect(pixelsEqual(allPixels(base), allPixels(shaped))).toBe(false);
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
    const exportedBounds = alphaBounds(exported);
    expect(exportedBounds.width).toBeGreaterThan(0);
    expect(exportedBounds.height).toBeGreaterThan(0);
    expectBoundsScale(preview, exported);
  });

  it('effect resolution locking preserves scale-one scanline texture in larger exports', async () => {
    const effectDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [
        makeFillLayer({
          color: '#ff5a36',
          opacity: 100,
        }),
        makeEffectPresetLayer('scanlines', { scanlines: 80, scanlineWidth: 1 }),
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

  it('scanline width increases line thickness while preserving export scale lock', async () => {
    const effectDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [
        makeFillLayer({
          color: '#ff5a36',
          opacity: 100,
        }),
        makeEffectPresetLayer('scanlines', { scanlines: 100, scanlineWidth: 3 }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const base = await renderDocument(effectDoc, 540, 540, new Map(), {
      draft: true,
      graphMode: 'stack',
    });
    const scaled = await renderDocument(effectDoc, 1080, 1080, new Map(), {
      draft: true,
      graphMode: 'stack',
      effectResolution: { width: 540, height: 540 },
    });

    expect(samplePixel(base, 10, 0)).toEqual([0, 0, 0, 255]);
    expect(samplePixel(base, 10, 1)).toEqual([0, 0, 0, 255]);
    expect(samplePixel(base, 10, 2)).toEqual([0, 0, 0, 255]);
    expect(samplePixel(base, 10, 3)).toEqual([255, 90, 54, 255]);
    expect(samplePixel(scaled, 20, 0)).toEqual(samplePixel(base, 10, 0));
    expect(samplePixel(scaled, 20, 6)).toEqual(samplePixel(base, 10, 3));
  });

  it('solarize and bleach bypass render visible pixels over a source', async () => {
    const source = makeFillLayer({ color: '#d6c8a5', opacity: 100 });
    const effectDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [
        source,
        makeEffectPresetLayer('solarize', { solarize: 70 }),
        makeEffectPresetLayer('bleachBypass', { bleachBypass: 70 }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const base = await renderDocument({ ...effectDoc, layers: [source] }, 64, 64, new Map(), { graphMode: 'stack' });
    const effected = await renderDocument(effectDoc, 64, 64, new Map(), { graphMode: 'stack' });

    expect(visiblePixelCount(effected)).toBe(64 * 64);
    expect(samplePixel(effected, 32, 32)).not.toEqual(samplePixel(base, 32, 32));
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
