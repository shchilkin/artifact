import { describe, expect, it } from 'vitest';

import { makeSourceLayer } from '../types/config';
import { renderPrimitiveToCanvas } from './primitiveRenderer';

function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8 && Math.max(data[i], data[i + 1], data[i + 2]) > 16) return true;
  }
  return false;
}

describe('renderPrimitiveToCanvas', () => {
  it('returns visible fallback pixels when WebGL is unavailable', async () => {
    const canvas = await renderPrimitiveToCanvas(makeSourceLayer('primitive'), 64);

    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
    expect(hasVisiblePixels(canvas)).toBe(true);
  });
});
