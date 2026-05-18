import { describe, expect, it } from 'vitest';
import { type EffectPixelTransformRequest, transformEffectPixels } from './effectPixelTransform';

function makePixels() {
  return new Uint8ClampedArray([10, 20, 30, 255, 80, 90, 100, 255, 150, 160, 170, 255, 220, 230, 240, 255]);
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
    const result = transformEffectPixels({
      width: 2,
      height: 2,
      data: makePixels(),
      operations: [{ type: 'kaleidoscope', amount: 70 }],
    });

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.data).toHaveLength(16);
  });
});
