import { describe, expect, it } from 'vitest';

import { makeSourceLayer } from '../types/config';
import { primitiveRendererTestInternals, renderPrimitiveToCanvas } from './primitiveRenderer';
import { measureAlphaBounds } from './render/alphaBounds';

function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 8 && Math.max(data[i], data[i + 1], data[i + 2]) > 16) return true;
  }
  return false;
}

function visibleBounds(canvas: HTMLCanvasElement): { width: number; height: number } | null {
  return measureAlphaBounds(canvas);
}

describe('renderPrimitiveToCanvas', () => {
  it('returns visible fallback pixels when WebGL is unavailable', async () => {
    const canvas = await renderPrimitiveToCanvas(makeSourceLayer('primitive'), 64);

    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('can bypass WebGL for draft preview fallback rendering', async () => {
    const canvas = await renderPrimitiveToCanvas(
      makeSourceLayer('primitive', { primitiveShape: 'cube' }),
      64,
      undefined,
      {
        forceFallback: true,
      },
    );

    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('supports rectangular primitive render targets for aspect-aware previews', async () => {
    const canvas = await renderPrimitiveToCanvas(
      makeSourceLayer('primitive', { primitiveShape: 'sphere' }),
      { width: 96, height: 54 },
      undefined,
      { forceFallback: true },
    );

    expect(canvas.width).toBe(96);
    expect(canvas.height).toBe(54);
    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('detects tiny off-grid primitive content so low zoom does not trigger fallback rendering', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 48, 32, 1)';
    ctx.fillRect(123, 117, 3, 3);

    const bounds = visibleBounds(canvas);

    expect(bounds).not.toBeNull();
    expect(bounds?.width).toBe(3);
    expect(bounds?.height).toBe(3);
    expect(primitiveRendererTestInternals.canvasHasPrimitiveContent(canvas)).toBe(true);
  });
});
