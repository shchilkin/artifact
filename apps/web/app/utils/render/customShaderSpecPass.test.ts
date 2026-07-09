import { describe, expect, it } from 'vitest';
import { makeGraphShaderNode } from '../../types/config';
import { createCanvas } from './canvas';
import { renderCustomShaderSpecPass } from './customShaderSpecPass';

function solidCanvas(color: string, width = 48, height = 24) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function horizontalGradient(width = 64, height = 16) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#000000');
  gradient.addColorStop(1, '#ffffff');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function rgbAt(canvas: HTMLCanvasElement, x: number, y: number) {
  return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data.slice(0, 3));
}

function pixels(canvas: HTMLCanvasElement) {
  return Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data);
}

describe('AI shader spec pass', () => {
  it('maps source luminance through the saved palette', () => {
    const source = horizontalGradient();
    const node = makeGraphShaderNode({
      shaderKind: 'customSpec',
      distortion: 0,
      customShaderSpec: {
        version: 2,
        provenance: { source: 'openai' },
        base: 0.5,
        contrast: 1,
        palette: ['#ff0000', '#0000ff'],
        operations: [
          { op: 'sourceLuma', amount: 1 },
          { op: 'gradientMap', amount: 1 },
        ],
      },
    });

    const output = renderCustomShaderSpecPass(source, node, 17, source.width, source.height);

    expect(rgbAt(output, 0, 8)[0]).toBeGreaterThan(220);
    expect(rgbAt(output, 0, 8)[2]).toBeLessThan(30);
    expect(rgbAt(output, 63, 8)[0]).toBeLessThan(30);
    expect(rgbAt(output, 63, 8)[2]).toBeGreaterThan(220);
  });

  it('executes source-aware and procedural operations in their declared order', () => {
    const source = solidCanvas('#000000');
    const makeNode = (
      operations: NonNullable<ReturnType<typeof makeGraphShaderNode>['customShaderSpec']>['operations'],
    ) =>
      makeGraphShaderNode({
        shaderKind: 'customSpec',
        distortion: 0,
        customShaderSpec: {
          version: 2,
          provenance: { source: 'openai' },
          base: 0.25,
          contrast: 1,
          palette: ['#ff0000', '#0000ff'],
          operations,
        },
      });
    const sourceThenInvert = makeNode([
      { op: 'sourceLuma', amount: 1 },
      { op: 'invert', amount: 1 },
      { op: 'gradientMap', amount: 1 },
    ]);
    const invertThenSource = makeNode([
      { op: 'invert', amount: 1 },
      { op: 'sourceLuma', amount: 1 },
      { op: 'gradientMap', amount: 1 },
    ]);

    const first = renderCustomShaderSpecPass(source, sourceThenInvert, 17, source.width, source.height);
    const second = renderCustomShaderSpecPass(source, invertThenSource, 17, source.width, source.height);

    expect(rgbAt(first, 24, 12)[2]).toBeGreaterThan(220);
    expect(rgbAt(second, 24, 12)[0]).toBeGreaterThan(220);
  });

  it('does not inherit hidden preset controls', () => {
    const source = horizontalGradient();
    const customShaderSpec = {
      version: 2 as const,
      provenance: { source: 'openai' as const },
      base: 0.42,
      contrast: 1.3,
      palette: ['#101020', '#66ddff'],
      operations: [
        { op: 'noise' as const, scale: 3.4, amount: 0.5, octaves: 4, seedOffset: 12 },
        { op: 'gradientMap' as const, amount: 0.75 },
      ],
    };
    const first = makeGraphShaderNode({
      shaderKind: 'customSpec',
      customShaderSpec,
      distortion: 0,
      scale: 40,
      rotation: -90,
      offsetX: -80,
      offsetY: 70,
      seedOffset: 1,
    });
    const second = makeGraphShaderNode({
      shaderKind: 'customSpec',
      customShaderSpec,
      distortion: 100,
      scale: 300,
      rotation: 140,
      offsetX: 90,
      offsetY: -60,
      seedOffset: 9999,
    });

    expect(pixels(renderCustomShaderSpecPass(source, first, 17, source.width, source.height))).toEqual(
      pixels(renderCustomShaderSpecPass(source, second, 17, source.width, source.height)),
    );
  });
});
