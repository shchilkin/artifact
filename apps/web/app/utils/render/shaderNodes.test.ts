import { describe, expect, it } from 'vitest';
import { makeGraphShaderNode } from '../../types/config';
import { renderShaderNodeToCanvas } from './shaderNodes';

function sampleRgb(canvas: HTMLCanvasElement, x: number, y: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as const;
}

function rgbDelta(a: readonly [number, number, number], b: readonly [number, number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

describe('shader node renderer', () => {
  it('keeps spiral continuous across the angular wrap seam', () => {
    const canvas = renderShaderNodeToCanvas(
      makeGraphShaderNode({
        id: 'spiral-seam',
        shaderKind: 'spiral',
        colorA: '#ff3b5c',
        colorB: '#42e8f5',
        colorC: '#fff36a',
        colorD: '#7f5cff',
        grain: 0,
        scale: 100,
        swirl: 88,
      }),
      1171,
      360,
      224,
    );

    const x = 72;
    const seamY = Math.floor(canvas.height / 2);
    const above = sampleRgb(canvas, x, seamY - 1);
    const below = sampleRgb(canvas, x, seamY);

    expect(rgbDelta(above, below)).toBeLessThan(48);
  });
});
