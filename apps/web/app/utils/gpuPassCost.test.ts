import { beforeEach, describe, expect, it } from 'vitest';
import { estimateGpuPassMs, recordGpuPass, resetGpuPassCost } from './gpuPassCost';

const DRAFT = 540 * 540;
const FULL = 1080 * 1080;

describe('gpuPassCost', () => {
  beforeEach(() => resetGpuPassCost());

  it('has no estimate before a pass is recorded', () => {
    expect(estimateGpuPassMs(DRAFT)).toBeNull();
  });

  it('scales passes of one size with the pixel count', () => {
    recordGpuPass(10, 540, 540);
    expect(estimateGpuPassMs(DRAFT)).toBeCloseTo(10);
    expect(estimateGpuPassMs(FULL)).toBeCloseTo(40);
  });

  it('separates the fixed cost from the per-pixel cost', () => {
    // 2 ms fixed plus 10 ms per megapixel.
    recordGpuPass(2 + 10 * 0.2916, 540, 540);
    recordGpuPass(2 + 10 * 1.1664, 1080, 1080);
    expect(estimateGpuPassMs(270 * 270)).toBeCloseTo(2 + 10 * 0.0729);
  });

  it('ignores empty or invalid passes', () => {
    recordGpuPass(10, 0, 100);
    recordGpuPass(Number.NaN, 100, 100);
    expect(estimateGpuPassMs(DRAFT)).toBeNull();
  });
});
