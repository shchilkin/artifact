/**
 * Estimate of what one GPU effect pass (canvas upload, filters, readback) costs on this device, fitted as a fixed
 * cost plus a cost per megapixel over the layer preview's recent passes. Software WebGL is roughly ten times slower
 * than a hardware GPU, so the preview uses the estimate to size its interactive frames. Only passes recorded with
 * `recordGpuCost` count, so thumbnails, gallery previews, and export do not skew it. This module does not import
 * Pixi, so reading the estimate never loads the GPU modules.
 */
const SAMPLE_LIMIT = 16;
/** Below this spread of pass sizes the fixed cost cannot be told apart from the per-pixel cost. */
const MIN_MEGAPIXEL_SPREAD = 0.05;

const samples: Array<{ megapixels: number; ms: number }> = [];

export function recordGpuPass(durationMs: number, width: number, height: number) {
  const megapixels = (width * height) / 1_000_000;
  if (!(durationMs >= 0) || !(megapixels > 0)) return;
  samples.push({ megapixels, ms: durationMs });
  if (samples.length > SAMPLE_LIMIT) samples.shift();
}

/** Expected milliseconds for one pass of `pixels`, or null before any pass was recorded. */
export function estimateGpuPassMs(pixels: number): number | null {
  if (samples.length === 0) return null;
  const megapixels = pixels / 1_000_000;
  const meanMegapixels = samples.reduce((sum, sample) => sum + sample.megapixels, 0) / samples.length;
  const meanMs = samples.reduce((sum, sample) => sum + sample.ms, 0) / samples.length;
  let covariance = 0;
  let variance = 0;
  for (const sample of samples) {
    covariance += (sample.megapixels - meanMegapixels) * (sample.ms - meanMs);
    variance += (sample.megapixels - meanMegapixels) ** 2;
  }
  const spread = Math.max(...samples.map((s) => s.megapixels)) - Math.min(...samples.map((s) => s.megapixels));
  // Passes of one size: scale their mean with the pixel count.
  if (spread < MIN_MEGAPIXEL_SPREAD || variance === 0) return (meanMs / meanMegapixels) * megapixels;
  const perMegapixel = Math.max(0, covariance / variance);
  const fixed = Math.max(0, meanMs - perMegapixel * meanMegapixels);
  return fixed + perMegapixel * megapixels;
}

export function resetGpuPassCost() {
  samples.length = 0;
}
