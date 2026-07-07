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
  it('renders custom shader specs deterministically from the saved spec', () => {
    const node = makeGraphShaderNode({
      id: 'custom-spec',
      shaderKind: 'customSpec',
      grain: 0,
      customShaderSpec: {
        version: 1,
        palette: ['#101020', '#ff3050', '#5cf0ff'],
        base: 0.42,
        contrast: 1.4,
        operations: [
          { op: 'noise', scale: 4, amount: 0.3, octaves: 3 },
          { op: 'rings', frequency: 18, amount: 0.22, centerX: 0.1, centerY: -0.2 },
          { op: 'posterize', steps: 5 },
        ],
      },
    });
    const first = renderShaderNodeToCanvas(node, 1171, 220, 140);
    const second = renderShaderNodeToCanvas(node, 1171, 220, 140);

    expect(sampleRgb(first, 40, 30)).toEqual(sampleRgb(second, 40, 30));
    expect(rgbDelta(sampleRgb(first, 40, 30), sampleRgb(first, 180, 110))).toBeGreaterThan(20);
  });

  it('renders custom code shader nodes with visible pixels', () => {
    const node = makeGraphShaderNode({
      id: 'custom-code',
      shaderKind: 'customCode',
      distortion: 64,
      customShaderCode: {
        version: 1,
        language: 'glsl-fragment',
        code: 'vec4 mainImage(vec2 uv) { return vec4(uv.x, uv.y, 1.0 - uv.x, 1.0); }',
      },
    });
    const first = renderShaderNodeToCanvas(node, 1171, 220, 140);
    const second = renderShaderNodeToCanvas(node, 1171, 220, 140);

    expect(sampleRgb(first, 40, 30)).toEqual(sampleRgb(second, 40, 30));
    expect(rgbDelta(sampleRgb(first, 30, 30), sampleRgb(first, 190, 110))).toBeGreaterThan(10);
  });

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
