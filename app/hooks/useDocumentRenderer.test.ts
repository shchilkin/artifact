import { describe, expect, it } from 'vitest';

import { type CanvasDocument, makeSourceLayer } from '../types/config';
import { isLikelyBlankRender } from './useDocumentRenderer';

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
