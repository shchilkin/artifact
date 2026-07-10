import { describe, expect, it } from 'vitest';
import { makeGraphShaderNode } from '../../types/config';
import { makeDefaultCodeShaderInstance } from '../customShaderCode';
import { renderShaderNodeToCanvas } from './shaderNodes';

function sampleRgb(canvas: HTMLCanvasElement, x: number, y: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as const;
}

function sampleRgba(canvas: HTMLCanvasElement, x: number, y: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0] as const;
}

function rgbDelta(a: readonly [number, number, number], b: readonly [number, number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

describe('shader node renderer', () => {
  it('renders empty AI shader nodes as transparent until a definition is created', () => {
    const canvas = renderShaderNodeToCanvas(
      makeGraphShaderNode({
        id: 'empty-ai-shader',
        shaderKind: 'aiShader',
      }),
      1171,
      220,
      140,
    );

    expect(sampleRgba(canvas, 40, 30)).toEqual([0, 0, 0, 0]);
    expect(sampleRgba(canvas, 180, 110)).toEqual([0, 0, 0, 0]);
  });

  it('keeps valid custom code fills transparent when WebGL is unavailable', () => {
    const node = makeGraphShaderNode({
      id: 'custom-code',
      shaderKind: 'customCode',
      distortion: 64,
      shaderInstance: {
        ...makeDefaultCodeShaderInstance('custom-code'),
        definition: {
          ...makeDefaultCodeShaderInstance('custom-code').definition,
          code: 'vec4 mainImage(vec2 uv) { return vec4(uv.x, uv.y, 1.0 - uv.x, 1.0); }',
        },
      },
    });
    const first = renderShaderNodeToCanvas(node, 1171, 220, 140);
    const second = renderShaderNodeToCanvas(node, 1171, 220, 140);

    expect(sampleRgba(first, 40, 30)).toEqual([0, 0, 0, 0]);
    expect(sampleRgba(second, 40, 30)).toEqual([0, 0, 0, 0]);
  });

  it('renders empty custom code shader nodes as transparent', () => {
    const canvas = renderShaderNodeToCanvas(
      makeGraphShaderNode({
        id: 'empty-code-shader',
        shaderKind: 'customCode',
        shaderInstance: makeDefaultCodeShaderInstance('empty-code-shader'),
      }),
      1171,
      220,
      140,
    );

    expect(sampleRgba(canvas, 40, 30)).toEqual([0, 0, 0, 0]);
    expect(sampleRgba(canvas, 180, 110)).toEqual([0, 0, 0, 0]);
  });

  it('renders invalid non-empty custom code as transparent instead of inventing a fallback image', () => {
    const node = makeGraphShaderNode({
      id: 'invalid-code-shader',
      shaderKind: 'customCode',
      shaderInstance: {
        ...makeDefaultCodeShaderInstance('invalid-code-shader'),
        definition: {
          ...makeDefaultCodeShaderInstance('invalid-code-shader').definition,
          code: 'vec4 shade(vec2 uv) { return vec4(uv, 0.0, 1.0); }',
        },
      },
    });
    const first = renderShaderNodeToCanvas(node, 1171, 220, 140);
    const second = renderShaderNodeToCanvas(node, 1171, 220, 140);

    expect(sampleRgba(first, 40, 30)).toEqual([0, 0, 0, 0]);
    expect(sampleRgba(second, 40, 30)).toEqual([0, 0, 0, 0]);
  });

  it('uses every configured static radial palette color', () => {
    const base = makeGraphShaderNode({
      shaderKind: 'staticRadialGradient',
      grain: 0,
      palette: ['#110000', '#220000', '#330000', '#440000', '#550000'],
    });
    const edited = { ...base, palette: ['#110000', '#220000', '#330000', '#440000', '#005500'] };

    const first = renderShaderNodeToCanvas(base, 1171, 220, 140);
    const second = renderShaderNodeToCanvas(edited, 1171, 220, 140);

    expect(rgbDelta(sampleRgb(first, 0, 0), sampleRgb(second, 0, 0))).toBeGreaterThan(20);
  });

  it('uses the final dot grid palette color as its background', () => {
    const base = makeGraphShaderNode({
      shaderKind: 'dotGrid',
      grain: 0,
      palette: ['#111111', '#eeeeee', '#ff0000'],
    });
    const edited = { ...base, palette: ['#111111', '#eeeeee', '#0000ff'] };

    const first = renderShaderNodeToCanvas(base, 1171, 220, 140);
    const second = renderShaderNodeToCanvas(edited, 1171, 220, 140);

    expect(rgbDelta(sampleRgb(first, 0, 0), sampleRgb(second, 0, 0))).toBeGreaterThan(100);
  });

  it('keeps spiral continuous across the angular wrap seam', () => {
    const canvas = renderShaderNodeToCanvas(
      makeGraphShaderNode({
        id: 'spiral-seam',
        shaderKind: 'spiral',
        palette: ['#ff3b5c', '#42e8f5', '#fff36a', '#7f5cff'],
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
