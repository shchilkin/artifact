import { describe, expect, it } from 'vitest';
import { type EffectPixelTransformRequest, transformEffectPixels } from './effectPixelTransform';

function makePixels() {
  return new Uint8ClampedArray([10, 20, 30, 255, 80, 90, 100, 255, 150, 160, 170, 255, 220, 230, 240, 255]);
}

function alphaValues(data: Uint8ClampedArray) {
  const values: number[] = [];
  for (let i = 3; i < data.length; i += 4) values.push(data[i] ?? 0);
  return values;
}

function transformFixturePixels(operations: EffectPixelTransformRequest['operations']) {
  return transformEffectPixels({
    width: 2,
    height: 2,
    data: makePixels(),
    operations,
  });
}

function expectVisibleAlphaPreservingTransform(result: ReturnType<typeof transformEffectPixels>) {
  expect(alphaValues(result.data)).toEqual([255, 255, 255, 255]);
  expect(result.data).not.toEqual(makePixels());
}

describe('transformEffectPixels', () => {
  it('applies deterministic pixel operations', () => {
    const request: EffectPixelTransformRequest = {
      width: 2,
      height: 2,
      data: makePixels(),
      operations: [
        { type: 'solarize', amount: 80 },
        { type: 'bleachBypass', amount: 45 },
        { type: 'fog', amount: 30, color: '#ddeeff' },
      ],
    };

    const a = transformEffectPixels({ ...request, data: makePixels() });
    const b = transformEffectPixels({ ...request, data: makePixels() });

    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(makePixels());
  });

  it('preserves dimensions while returning transformed pixels', () => {
    const result = transformFixturePixels([{ type: 'kaleidoscope', amount: 70 }]);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.data).toHaveLength(16);
  });

  it('keeps solarize output visible and alpha-preserving', () => {
    expectVisibleAlphaPreservingTransform(transformFixturePixels([{ type: 'solarize', amount: 80 }]));
  });

  it('keeps bleach bypass output visible and alpha-preserving', () => {
    expectVisibleAlphaPreservingTransform(transformFixturePixels([{ type: 'bleachBypass', amount: 80 }]));
  });

  it('keeps fog output visible and alpha-preserving', () => {
    expectVisibleAlphaPreservingTransform(transformFixturePixels([{ type: 'fog', amount: 80, color: '#ddeeff' }]));
  });

  it('maps visible pixels to the nearest indexed palette color', () => {
    const result = transformEffectPixels({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([250, 20, 20, 255, 20, 20, 240, 255]),
      operations: [{ type: 'indexedPalette', amount: 100, colors: ['#ff0000', '#0000ff'] }],
    });

    expect(Array.from(result.data)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('maps visible pixels through a luminance gradient ramp', () => {
    const result = transformEffectPixels({
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]),
      operations: [
        {
          type: 'gradientMap',
          amount: 100,
          shadow: '#0000ff',
          mid: '#00ff00',
          highlight: '#ff0000',
        },
      ],
    });

    expect(Array.from(result.data)).toEqual([0, 0, 255, 255, 1, 254, 0, 255, 255, 0, 0, 255]);
  });

  it('crossfeeds color channels while preserving alpha', () => {
    const result = transformEffectPixels({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([240, 60, 20, 128]),
      operations: [{ type: 'channelMixer', amount: 100, redMix: 100, greenMix: 100, blueMix: 100 }],
    });

    expect(Array.from(result.data)).toEqual([60, 20, 240, 128]);
  });

  it('applies bokeh blur while preserving source alpha', () => {
    const source = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 180, 0, 0, 0, 255, 0, 0, 0, 255, 40, 40, 40, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0,
      0, 255, 0, 0, 0, 255,
    ]);
    const result = transformEffectPixels({
      width: 3,
      height: 3,
      data: new Uint8ClampedArray(source),
      operations: [{ type: 'bokehBlur', amount: 1, threshold: 60 }],
    });

    expect(result.data).not.toEqual(source);
    expect(alphaValues(result.data)).toEqual([255, 180, 255, 255, 255, 255, 255, 255, 255]);
  });

  it('draws hatching over darker visible pixels', () => {
    const source = new Uint8ClampedArray([30, 30, 30, 255, 220, 220, 220, 255, 30, 30, 30, 255]);
    const result = transformEffectPixels({
      width: 3,
      height: 1,
      data: new Uint8ClampedArray(source),
      operations: [{ type: 'hatching', amount: 100, scale: 3, angle: 0 }],
    });

    expect(Math.min(result.data[0], result.data[8])).toBeLessThan(30);
    expect(result.data[8] / source[8]).toBeLessThan(result.data[4] / source[4]);
    expect(alphaValues(result.data)).toEqual([255, 255, 255]);
  });

  it('stretches source pixels in a direction while preserving visible alpha', () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const result = transformEffectPixels({
      width: 3,
      height: 1,
      data: new Uint8ClampedArray(source),
      operations: [{ type: 'pixelStretch', amount: 100, length: 2, angle: 0 }],
    });

    expect(result.data[4]).toBeGreaterThan(source[4]);
    expect(alphaValues(result.data)).toEqual([255, 255, 255]);
  });

  it('refracts pixels through a pattern while preserving alpha', () => {
    const source = new Uint8ClampedArray([
      0, 0, 0, 255, 40, 0, 0, 255, 80, 0, 0, 255, 120, 0, 0, 255, 160, 0, 0, 255, 200, 0, 0, 255,
    ]);
    const result = transformEffectPixels({
      width: 6,
      height: 1,
      data: new Uint8ClampedArray(source),
      operations: [{ type: 'patternRefraction', amount: 100, scale: 4, angle: 45 }],
    });

    expect(result.data).not.toEqual(source);
    expect(alphaValues(result.data)).toEqual([255, 255, 255, 255, 255, 255]);
  });

  it('merges nearby alpha regions with gooey thresholding', () => {
    const source = new Uint8ClampedArray([220, 80, 40, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 220, 80, 40, 255]);
    const result = transformEffectPixels({
      width: 5,
      height: 1,
      data: new Uint8ClampedArray(source),
      operations: [{ type: 'gooeyMerge', amount: 100, radius: 2, threshold: 12 }],
    });

    expect(result.data[11]).toBeGreaterThan(0);
    expect(result.data[3]).toBe(255);
    expect(result.data[19]).toBe(255);
  });

  it('hardens partial alpha for edge crush while preserving opaque pixels', () => {
    const result = transformEffectPixels({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 60, 80, 90, 100, 255]),
      operations: [{ type: 'edgeCrush', amount: 100 }],
    });

    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBe(255);
  });

  it('trims hard alpha borders at high edge crush amounts', () => {
    const result = transformEffectPixels({
      width: 3,
      height: 3,
      data: new Uint8ClampedArray([
        80, 90, 100, 255, 80, 90, 100, 255, 80, 90, 100, 255, 80, 90, 100, 255, 80, 90, 100, 255, 80, 90, 100, 255, 80,
        90, 100, 255, 80, 90, 100, 255, 80, 90, 100, 255,
      ]),
      operations: [{ type: 'edgeCrush', amount: 100 }],
    });

    expect(alphaValues(result.data).filter((alpha) => alpha > 0).length).toBeLessThan(9);
  });

  it('chips hard alpha-mask borders for silhouette crush', () => {
    const result = transformEffectPixels({
      width: 3,
      height: 3,
      data: new Uint8ClampedArray([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 40, 20, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0,
      ]),
      operations: [{ type: 'silhouetteCrush', amount: 100 }],
    });

    expect(alphaValues(result.data).filter((alpha) => alpha > 0).length).toBeGreaterThan(1);
  });

  it('chips opaque high-contrast borders for silhouette crush', () => {
    const source = new Uint8ClampedArray([4, 4, 24, 255, 220, 220, 210, 255]);
    const result = transformEffectPixels({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(source),
      operations: [{ type: 'silhouetteCrush', amount: 100 }],
    });

    expect(result.data).not.toEqual(source);
    expect(alphaValues(result.data)).toEqual([255, 255]);
  });
});
