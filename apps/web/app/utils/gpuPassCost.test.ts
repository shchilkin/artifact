import { beforeEach, describe, expect, it } from 'vitest';
import { gpuPassMsPerMegapixel, recordGpuPass, resetGpuPassCost } from './gpuPassCost';

describe('gpuPassCost', () => {
  beforeEach(() => resetGpuPassCost());

  it('has no estimate before a pass completes', () => {
    expect(gpuPassMsPerMegapixel()).toBeNull();
  });

  it('normalizes pass time by pixel count and smooths later passes', () => {
    recordGpuPass(10, 1000, 1000);
    expect(gpuPassMsPerMegapixel()).toBe(10);
    recordGpuPass(5, 1000, 250);
    expect(gpuPassMsPerMegapixel()).toBeCloseTo(13);
  });

  it('ignores empty or invalid passes', () => {
    recordGpuPass(10, 0, 100);
    recordGpuPass(Number.NaN, 100, 100);
    expect(gpuPassMsPerMegapixel()).toBeNull();
  });
});
