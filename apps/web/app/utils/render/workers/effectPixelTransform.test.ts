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
});
