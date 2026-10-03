import { describe, expect, it } from 'vitest';

import { type CanvasDocument, makeSourceLayer } from '../types/config';
import { chooseInteractiveScale, getRenderDimensions, isLikelyBlankRender } from './useDocumentRenderer';

function makeDoc(layers: CanvasDocument['layers']): CanvasDocument {
  return {
    global: { bg: '#120020', seed: 1, aspect: '1:1' },
    layers,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function makeCanvas(fill: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

describe('isLikelyBlankRender', () => {
  it('flags a dark blank frame when visible source layers should render', () => {
    const doc = makeDoc([makeSourceLayer('primitive')]);

    expect(isLikelyBlankRender(makeCanvas('#000000'), doc)).toBe(true);
  });

  it('does not flag intentionally empty documents', () => {
    expect(isLikelyBlankRender(makeCanvas('#000000'), makeDoc([]))).toBe(false);
  });

  it('does not flag visible rendered content', () => {
    const doc = makeDoc([makeSourceLayer('primitive')]);
    const canvas = makeCanvas('#000000');
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff5a36';
    ctx.fillRect(16, 16, 32, 32);

    expect(isLikelyBlankRender(canvas, doc)).toBe(false);
  });
});

describe('getRenderDimensions', () => {
  it('caps high-resolution preview renders by their largest edge', () => {
    expect(getRenderDimensions(540, 960, 2, 720)).toEqual([405, 720]);
  });

  it('keeps draft preview renders at the display aspect when scale is one', () => {
    expect(getRenderDimensions(540, 960, 1, 540)).toEqual([304, 540]);
  });
});

describe('chooseInteractiveScale', () => {
  const draftPixels = 540 * 540;

  it('keeps the current scale without a budget or a GPU measurement', () => {
    expect(chooseInteractiveScale(1, 120, draftPixels, undefined)).toBe(1);
    expect(chooseInteractiveScale(0.5, null, draftPixels, 12)).toBe(0.5);
  });

  it('keeps the draft size when a GPU pass there fits the budget', () => {
    // A hardware GPU: about 4 ms for a 540 px pass.
    expect(chooseInteractiveScale(1, 14, draftPixels, 12)).toBe(1);
  });

  it('halves the interactive size on software WebGL', () => {
    // The CI runner: about 34 ms for a 540 px pass, 8.5 ms at 270 px.
    expect(chooseInteractiveScale(1, 117, draftPixels, 12)).toBe(0.5);
  });

  it('uses the middle size when it fits and never goes below half', () => {
    expect(chooseInteractiveScale(1, 60, draftPixels, 12)).toBe(0.75);
    expect(chooseInteractiveScale(1, 1000, draftPixels, 12)).toBe(0.5);
  });

  it('only grows again with headroom, so the size does not flip at the threshold', () => {
    // 540 px would take 11.7 ms: within the budget, but not within 70% of it.
    expect(chooseInteractiveScale(0.75, 40, draftPixels, 12)).toBe(0.75);
    expect(chooseInteractiveScale(1, 40, draftPixels, 12)).toBe(1);
    expect(chooseInteractiveScale(0.75, 25, draftPixels, 12)).toBe(1);
  });
});
