/**
 * Running estimate of what one GPU effect pass (canvas upload, filters, readback) costs on this device, in
 * milliseconds per megapixel. Software WebGL is roughly ten times slower than a hardware GPU, so previews use the
 * estimate to size their interactive passes. This module does not import Pixi, so reading the estimate never loads
 * the GPU modules.
 */
const SMOOTHING = 0.3;

let msPerMegapixel: number | null = null;

export function recordGpuPass(durationMs: number, width: number, height: number) {
  const megapixels = (width * height) / 1_000_000;
  if (!(durationMs >= 0) || !(megapixels > 0)) return;
  const sample = durationMs / megapixels;
  msPerMegapixel = msPerMegapixel === null ? sample : msPerMegapixel + (sample - msPerMegapixel) * SMOOTHING;
}

/** Null until a GPU pass has completed. */
export function gpuPassMsPerMegapixel(): number | null {
  return msPerMegapixel;
}

export function resetGpuPassCost() {
  msPerMegapixel = null;
}
