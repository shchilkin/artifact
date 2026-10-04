/**
 * Image comparison for the runtime parity harness (issue #331). Pure functions over RGBA bytes, so they run in the
 * browser harness and in unit tests alike. The tolerances are defined here once and documented in
 * `docs/runtime/README.md`.
 */

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, top row first, 4 bytes per pixel. */
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** Deterministic effects: the runtime runs the editor's own fragment, so outputs should match almost exactly. */
export const PIXEL_TOLERANCE = {
  /** A pixel differs when any RGB channel is off by more than this many levels (0–255). */
  channelThreshold: 8,
  /** Share of pixels allowed to differ. 0.1% is about 290 pixels at 540px. */
  maxDifferentRatio: 0.001,
  /** Mean absolute RGB difference, in levels. */
  maxMeanAbsDiff: 0.25,
} as const;

/** Stochastic effects: the GPU noise differs from the editor's CPU noise by design, so only statistics must agree. */
export const STATISTICS_TOLERANCE = {
  /** Per-channel mean, in levels. */
  maxMeanDiff: 2,
  /** Per-channel standard deviation (the square root of the variance), in levels. */
  maxStdDevDiff: 3,
  /** Per-channel histogram total-variation distance (0 identical, 1 disjoint). */
  maxHistogramDistance: 0.05,
  /** Histogram bins per channel. */
  histogramBins: 32,
} as const;

export interface PixelComparison {
  readonly mode: 'pixels';
  readonly pass: boolean;
  readonly meanAbsDiff: number;
  readonly maxChannelDiff: number;
  readonly differentPixels: number;
  readonly differentRatio: number;
  readonly tolerance: typeof PIXEL_TOLERANCE;
}

export interface ChannelStatistics {
  readonly mean: number;
  readonly variance: number;
  /** Normalised histogram: `bins` entries summing to 1. */
  readonly histogram: readonly number[];
}

export interface StatisticsComparison {
  readonly mode: 'statistics';
  readonly pass: boolean;
  /** Worst channel for each measure. */
  readonly meanDiff: number;
  readonly stdDevDiff: number;
  readonly histogramDistance: number;
  readonly tolerance: typeof STATISTICS_TOLERANCE;
}

export type ParityComparison = PixelComparison | StatisticsComparison;

function assertSameSize(expected: RgbaImage, actual: RgbaImage) {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `Image sizes differ: expected ${expected.width}×${expected.height}, actual ${actual.width}×${actual.height}.`,
    );
  }
}

function maxRgbDiff(a: RgbaImage['data'], b: RgbaImage['data'], index: number): number {
  return Math.max(
    Math.abs(a[index] - b[index]),
    Math.abs(a[index + 1] - b[index + 1]),
    Math.abs(a[index + 2] - b[index + 2]),
  );
}

export function comparePixels(
  expected: RgbaImage,
  actual: RgbaImage,
  tolerance: typeof PIXEL_TOLERANCE = PIXEL_TOLERANCE,
): PixelComparison {
  assertSameSize(expected, actual);
  const a = expected.data;
  const b = actual.data;
  const pixels = expected.width * expected.height;
  let total = 0;
  let maxChannelDiff = 0;
  let differentPixels = 0;
  for (let index = 0; index < a.length; index += 4) {
    total +=
      Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
    const diff = maxRgbDiff(a, b, index);
    if (diff > maxChannelDiff) maxChannelDiff = diff;
    if (diff > tolerance.channelThreshold) differentPixels += 1;
  }
  const meanAbsDiff = total / (pixels * 3);
  const differentRatio = differentPixels / pixels;
  return {
    mode: 'pixels',
    pass: differentRatio <= tolerance.maxDifferentRatio && meanAbsDiff <= tolerance.maxMeanAbsDiff,
    meanAbsDiff,
    maxChannelDiff,
    differentPixels,
    differentRatio,
    tolerance,
  };
}

/** Mean, variance and normalised histogram of each RGB channel. */
export function channelStatistics(image: RgbaImage, bins: number = STATISTICS_TOLERANCE.histogramBins) {
  const pixels = image.width * image.height;
  const channels: ChannelStatistics[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const histogram = new Array<number>(bins).fill(0);
    let sum = 0;
    let sumSquares = 0;
    for (let index = channel; index < image.data.length; index += 4) {
      const value = image.data[index];
      sum += value;
      sumSquares += value * value;
      histogram[Math.min(bins - 1, Math.floor((value * bins) / 256))] += 1;
    }
    const mean = sum / pixels;
    channels.push({
      mean,
      variance: Math.max(0, sumSquares / pixels - mean * mean),
      histogram: histogram.map((count) => count / pixels),
    });
  }
  return channels;
}

/** Total-variation distance between two normalised histograms. */
export function histogramDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Histograms have different bin counts.');
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index]);
  return total / 2;
}

export function compareStatistics(
  expected: RgbaImage,
  actual: RgbaImage,
  tolerance: typeof STATISTICS_TOLERANCE = STATISTICS_TOLERANCE,
): StatisticsComparison {
  assertSameSize(expected, actual);
  const left = channelStatistics(expected, tolerance.histogramBins);
  const right = channelStatistics(actual, tolerance.histogramBins);
  let meanDiff = 0;
  let stdDevDiff = 0;
  let distance = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    meanDiff = Math.max(meanDiff, Math.abs(left[channel].mean - right[channel].mean));
    stdDevDiff = Math.max(stdDevDiff, Math.abs(Math.sqrt(left[channel].variance) - Math.sqrt(right[channel].variance)));
    distance = Math.max(distance, histogramDistance(left[channel].histogram, right[channel].histogram));
  }
  return {
    mode: 'statistics',
    pass:
      meanDiff <= tolerance.maxMeanDiff &&
      stdDevDiff <= tolerance.maxStdDevDiff &&
      distance <= tolerance.maxHistogramDistance,
    meanDiff,
    stdDevDiff,
    histogramDistance: distance,
    tolerance,
  };
}

/** Pixels for deterministic effects, statistics for stochastic ones. */
export function compareParity(expected: RgbaImage, actual: RgbaImage, stochastic: boolean): ParityComparison {
  return stochastic ? compareStatistics(expected, actual) : comparePixels(expected, actual);
}

/**
 * A diff image for review: the expected image dimmed to grey, with pixels over the threshold in red (brighter for
 * larger differences) and smaller non-zero differences in amber.
 */
export function diffImage(
  expected: RgbaImage,
  actual: RgbaImage,
  threshold: number = PIXEL_TOLERANCE.channelThreshold,
): RgbaImage {
  assertSameSize(expected, actual);
  const a = expected.data;
  const b = actual.data;
  const out = new Uint8ClampedArray(a.length);
  for (let index = 0; index < a.length; index += 4) {
    const diff = maxRgbDiff(a, b, index);
    const grey = (a[index] * 0.299 + a[index + 1] * 0.587 + a[index + 2] * 0.114) * 0.3;
    if (diff > threshold) {
      out[index] = 128 + Math.min(127, diff);
      out[index + 1] = 0;
      out[index + 2] = 0;
    } else if (diff > 0) {
      out[index] = 200;
      out[index + 1] = 150;
      out[index + 2] = 0;
    } else {
      out[index] = grey;
      out[index + 1] = grey;
      out[index + 2] = grey;
    }
    out[index + 3] = 255;
  }
  return { width: expected.width, height: expected.height, data: out };
}

/** Places images side by side (all the same height), for a single expected | actual | diff review image. */
export function sideBySide(images: readonly RgbaImage[], gap = 8): RgbaImage {
  const height = images[0]?.height ?? 0;
  if (images.some((image) => image.height !== height)) throw new Error('Images must share a height.');
  const width = images.reduce((sum, image) => sum + image.width, 0) + gap * Math.max(0, images.length - 1);
  const out = new Uint8ClampedArray(width * height * 4);
  let left = 0;
  for (const image of images) {
    for (let y = 0; y < height; y += 1) {
      const row = image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4);
      out.set(row, (y * width + left) * 4);
    }
    left += image.width + gap;
  }
  return { width, height, data: out };
}
