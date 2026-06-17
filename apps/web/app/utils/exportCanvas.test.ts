import { describe, expect, it } from 'vitest';
import { samplePixel } from '../test-fixtures/render/fixtures';
import { type CanvasDocument, makeEffectPresetLayer, makeFillLayer } from '../types/config';
import { renderCoverExportCanvas } from './exportCanvas';

describe('renderCoverExportCanvas', () => {
  it('exports larger scales as pixel-identical upscales of the preview/base render', async () => {
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 42, aspect: '1:1' },
      layers: [
        makeFillLayer({ color: '#ff5a36', opacity: 100 }),
        makeEffectPresetLayer('dotGrain', {
          dotGrain: 100,
          dotGrainSize: 5,
          dotGrainDensity: 80,
          dotGrainJitter: 25,
        }),
      ],
      export: { format: 'png', scale: 2, target: 'cover' },
    };

    const base = await renderCoverExportCanvas(doc, new Map(), 1);
    const scaled = await renderCoverExportCanvas(doc, new Map(), 2);

    expect(base.width).toBe(1000);
    expect(base.height).toBe(1000);
    expect(scaled.width).toBe(2000);
    expect(scaled.height).toBe(2000);

    for (const [x, y] of [
      [14, 18],
      [125, 245],
      [333, 512],
      [720, 871],
    ] as const) {
      const pixel = samplePixel(base, x, y);
      expect(samplePixel(scaled, x * 2, y * 2)).toEqual(pixel);
      expect(samplePixel(scaled, x * 2 + 1, y * 2 + 1)).toEqual(pixel);
    }
  });
});
