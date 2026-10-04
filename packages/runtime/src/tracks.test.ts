import { describe, expect, it } from 'vitest';
import { evaluateTrack, loopPosition, trackDomain } from './tracks.js';

// Ported from the cover-motion experiment's tests (`coverMotion.test.ts` on `experiment/cover-motion`): the same
// loops, with the offsets read from the track value instead of a mutated document.
const duration = 2;

describe('loop position', () => {
  it('wraps time into the loop and treats the loop end as its start', () => {
    expect(loopPosition(0, duration)).toBe(0);
    expect(loopPosition(0.5, duration)).toBe(0.25);
    expect(loopPosition(2, duration)).toBe(0);
    expect(loopPosition(5, duration)).toBe(0.5);
    // Float noise from accumulated frame times still lands on the loop start.
    expect(loopPosition(0.1 * 3 * (duration / 0.3), duration)).toBe(0);
  });

  it('returns 0 without a loop', () => {
    expect(loopPosition(3, 0)).toBe(0);
    expect(loopPosition(Number.NaN, duration)).toBe(0);
  });
});

describe('wave track', () => {
  const wave = { track: 'wave' } as const;

  it('oscillates in [-1, 1] and closes the loop', () => {
    expect(evaluateTrack(wave, 0, duration)).toBeCloseTo(0);
    expect(evaluateTrack(wave, 0.25, duration)).toBeCloseTo(1);
    expect(evaluateTrack(wave, 0.75, duration)).toBeCloseTo(-1);
    expect(evaluateTrack(wave, loopPosition(duration, duration), duration)).toBe(evaluateTrack(wave, 0, duration));
    // Approaching the loop end from below meets the start value: no jump at the seam.
    expect(evaluateTrack(wave, 1 - 1e-6, duration)).toBeCloseTo(evaluateTrack(wave, 0, duration), 4);
    expect(trackDomain('wave')).toEqual([-1, 1]);
  });

  it('runs whole cycles and phase offsets', () => {
    const fast = { track: 'wave', cycles: 3, phase: 0.25 } as const;
    expect(evaluateTrack(fast, 0, duration)).toBeCloseTo(1);
    expect(evaluateTrack(fast, 1 / 6, duration)).toBeCloseTo(-1);
    expect(evaluateTrack(fast, 1 - 1e-6, duration)).toBeCloseTo(evaluateTrack(fast, 0, duration), 4);
  });
});

describe('step track', () => {
  const step = { track: 'step', fps: 5, stride: 7 } as const;

  it('holds each value for 1 / fps seconds, then jumps by stride', () => {
    expect(evaluateTrack(step, 0, duration)).toBe(0);
    expect(evaluateTrack(step, 0.05, duration)).toBe(0);
    expect(evaluateTrack(step, 0.1, duration)).toBe(7);
    expect(evaluateTrack(step, 0.95, duration)).toBe(63);
    expect(trackDomain('step')).toBeNull();
  });

  it('closes the loop: the last step is as long as the others and the loop end restarts at 0', () => {
    // 2 s × 5 fps = 10 steps of 0.1 turns each.
    expect(evaluateTrack(step, 0.9, duration)).toBe(63);
    expect(evaluateTrack(step, 1 - 1e-6, duration)).toBe(63);
    expect(evaluateTrack(step, loopPosition(duration, duration), duration)).toBe(0);
  });

  it('defaults the stride to 1', () => {
    expect(evaluateTrack({ track: 'step', fps: 5 }, 0.35, duration)).toBe(3);
  });
});

describe('pulse track', () => {
  const pulse = { track: 'pulse', at: [0.5], length: 0.1 } as const;

  it('is 1 only inside its windows', () => {
    expect(evaluateTrack(pulse, 0.45, duration)).toBe(0);
    expect(evaluateTrack(pulse, 0.5, duration)).toBe(1);
    expect(evaluateTrack(pulse, 0.55, duration)).toBe(1);
    expect(evaluateTrack(pulse, 0.65, duration)).toBe(0);
    expect(trackDomain('pulse')).toEqual([0, 1]);
  });

  it('wraps a window across the loop seam', () => {
    const seam = { track: 'pulse', at: [0.95], length: 0.1 } as const;
    expect(evaluateTrack(seam, 0.97, duration)).toBe(1);
    expect(evaluateTrack(seam, loopPosition(duration, duration), duration)).toBe(1);
    expect(evaluateTrack(seam, 0.04, duration)).toBe(1);
    expect(evaluateTrack(seam, 0.06, duration)).toBe(0);
  });
});
