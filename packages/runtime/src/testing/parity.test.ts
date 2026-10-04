import { describe, expect, it } from 'vitest';
import {
  channelStatistics,
  compareParity,
  comparePixels,
  compareStatistics,
  diffImage,
  histogramDistance,
  insetImage,
  PIXEL_TOLERANCE,
  type RgbaImage,
  sideBySide,
} from './parity.js';

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const gradient = image(100, 100, (x, y) => [x * 2, y * 2, 128]);

describe('pixel parity', () => {
  it('passes identical images', () => {
    expect(comparePixels(gradient, gradient)).toMatchObject({
      pass: true,
      meanAbsDiff: 0,
      differentPixels: 0,
      maxChannelDiff: 0,
    });
  });

  it('allows rounding differences under the channel threshold', () => {
    const rounded = image(100, 100, (x, y) => [x * 2 + 1, y * 2, 128]);
    const result = comparePixels(gradient, rounded);
    expect(result.differentPixels).toBe(0);
    expect(result.meanAbsDiff).toBeCloseTo(1 / 3);
    // The mean limit still catches a systematic offset of one level in every pixel.
    expect(result.pass).toBe(result.meanAbsDiff <= PIXEL_TOLERANCE.maxMeanAbsDiff);
  });

  it('fails when more than 0.1% of pixels move by more than 8 levels', () => {
    // 11 of 10,000 pixels off by 40 levels.
    const spotted = image(100, 100, (x, y) => (y === 0 && x < 11 ? [x * 2 + 40, 0, 128] : [x * 2, y * 2, 128]));
    const result = comparePixels(gradient, spotted);
    expect(result.differentPixels).toBe(11);
    expect(result.maxChannelDiff).toBe(40);
    expect(result.pass).toBe(false);
  });

  it('rejects images of different sizes', () => {
    expect(() =>
      comparePixels(
        gradient,
        image(10, 10, () => [0, 0, 0]),
      ),
    ).toThrow('sizes differ');
  });
});

describe('statistical parity', () => {
  it('measures mean, variance and a normalised histogram per channel', () => {
    const half = image(10, 10, (x) => (x < 5 ? [0, 100, 255] : [255, 100, 255]));
    const [red, green, blue] = channelStatistics(half, 4);
    expect(red.mean).toBe(127.5);
    expect(red.variance).toBeCloseTo(127.5 ** 2);
    expect(red.histogram).toEqual([0.5, 0, 0, 0.5]);
    expect(green).toMatchObject({ mean: 100, variance: 0, histogram: [0, 1, 0, 0] });
    expect(blue.histogram).toEqual([0, 0, 0, 1]);
  });

  it('computes total-variation distance between histograms', () => {
    expect(histogramDistance([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(histogramDistance([1, 0], [0, 1])).toBe(1);
    expect(histogramDistance([0.6, 0.4], [0.5, 0.5])).toBeCloseTo(0.1);
  });

  it('accepts the same distribution in a different arrangement, which pixels reject', () => {
    // Every pixel of the mirrored image differs, but the set of values is the same.
    const mirrored = image(100, 100, (x, y) => [(99 - x) * 2, (99 - y) * 2, 128]);
    expect(comparePixels(gradient, mirrored).pass).toBe(false);
    expect(compareStatistics(gradient, mirrored)).toMatchObject({ pass: true, meanDiff: 0, histogramDistance: 0 });
  });

  it('rejects a shifted distribution', () => {
    const brighter = image(100, 100, (x, y) => [x * 2 + 20, y * 2, 128]);
    const result = compareStatistics(gradient, brighter);
    expect(result.meanDiff).toBeCloseTo(20);
    expect(result.pass).toBe(false);
  });

  it('picks the comparison from the stochastic flag', () => {
    expect(compareParity(gradient, gradient, false).mode).toBe('pixels');
    expect(compareParity(gradient, gradient, true).mode).toBe('statistics');
  });

  it("passes a case's widened pixel tolerance through to the pixel comparison", () => {
    // 11 of 10,000 pixels off by 40 levels: over the default 0.1%, within a widened 0.2%.
    const spotted = image(100, 100, (x, y) => (y === 0 && x < 11 ? [x * 2 + 40, 0, 128] : [x * 2, y * 2, 128]));
    expect(compareParity(gradient, spotted, false).pass).toBe(false);
    const widened = compareParity(gradient, spotted, false, { ...PIXEL_TOLERANCE, maxDifferentRatio: 0.002 });
    expect(widened).toMatchObject({ mode: 'pixels', pass: true, tolerance: { maxDifferentRatio: 0.002 } });
  });
});

describe('review images', () => {
  it('marks pixels over the threshold red, small differences amber, and the rest dimmed grey', () => {
    const expected = image(3, 1, () => [100, 100, 100]);
    const actual = image(3, 1, (x) => [[100, 104, 160][x], 100, 100]);
    const diff = diffImage(expected, actual);
    expect([...diff.data.subarray(0, 4)]).toEqual([30, 30, 30, 255]);
    expect([...diff.data.subarray(4, 8)]).toEqual([200, 150, 0, 255]);
    expect([...diff.data.subarray(8, 12)]).toEqual([188, 0, 0, 255]);
  });

  it('lays images out side by side with a gap', () => {
    const red = image(2, 2, () => [255, 0, 0]);
    const blue = image(3, 2, () => [0, 0, 255]);
    const combined = sideBySide([red, blue], 1);
    expect(combined).toMatchObject({ width: 6, height: 2 });
    expect([...combined.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...combined.data.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
    expect([...combined.data.subarray(12, 16)]).toEqual([0, 0, 255, 255]);
    expect(() => sideBySide([red, image(2, 3, () => [0, 0, 0])])).toThrow('share a height');
  });
});

describe('parity inset', () => {
  it('drops the outer pixels on every side and keeps the rest in place', () => {
    // 4×3, each pixel's red channel is its index.
    const data = new Uint8ClampedArray(4 * 3 * 4);
    for (let index = 0; index < 12; index += 1) data[index * 4] = index;
    const inner = insetImage({ width: 4, height: 3, data }, 1);
    expect(inner.width).toBe(2);
    expect(inner.height).toBe(1);
    expect([inner.data[0], inner.data[4]]).toEqual([5, 6]);
  });

  it('returns the image itself without an inset, and rejects one that leaves nothing', () => {
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    expect(insetImage(image, 0)).toBe(image);
    expect(() => insetImage(image, 1)).toThrow(/leaves nothing/);
  });
});
