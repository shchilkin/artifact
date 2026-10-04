/**
 * Time tracks: functions of loop time that drive bindings. Ported from the cover-motion experiment
 * (`apps/web/app/features/cover-motion/coverMotion.ts` on `experiment/cover-motion`), where tracks added offsets to
 * document fields. Here a track only produces a number; the binding decides where it goes and how it is scaled.
 */

/** Smooth oscillation in `[-1, 1]`. Whole `cycles` per loop keep the loop seamless. */
export interface WaveTrack {
  readonly track: 'wave';
  /** Whole oscillations per loop. Default 1. */
  readonly cycles?: number;
  /** Phase offset in loop turns (0..1). Default 0. */
  readonly phase?: number;
}

/**
 * Holds a value for `1 / fps` seconds, then jumps by `stride`; reads as boiling grain or glitch. Unbounded: the
 * value is `stride × steps so far`, so bindings add it (typically to a seed) rather than map it into a range.
 */
export interface StepTrack {
  readonly track: 'step';
  /** Steps per second. `loop.durationSeconds × fps` must be whole so the loop ends on a step boundary. */
  readonly fps: number;
  /** Amount added per step. Default 1. */
  readonly stride?: number;
}

/** `1` during short windows that start at loop positions `at` (0..1), `0` otherwise. Windows wrap across the loop. */
export interface PulseTrack {
  readonly track: 'pulse';
  readonly at: readonly number[];
  /** Window length in loop turns, in `(0, 1)`. */
  readonly length: number;
}

export type TimeTrack = WaveTrack | StepTrack | PulseTrack;
export type TimeTrackKind = TimeTrack['track'];

export const TIME_TRACK_KINDS: readonly TimeTrackKind[] = ['wave', 'step', 'pulse'];

/** Natural output range of a track kind, or `null` for the unbounded step track. */
export function trackDomain(kind: TimeTrackKind): readonly [number, number] | null {
  switch (kind) {
    case 'wave':
      return [-1, 1];
    case 'pulse':
      return [0, 1];
    case 'step':
      return null;
  }
}

/** Loop position (0..1) of `time` seconds in a loop of `durationSeconds`; the end of the loop wraps to 0. */
export function loopPosition(time: number, durationSeconds: number): number {
  if (!(durationSeconds > 0) || !Number.isFinite(time)) return 0;
  const turns = time / durationSeconds;
  const position = turns - Math.floor(turns);
  // Float noise either side of a whole turn counts as the loop's start.
  return position < 1e-9 || position > 1 - 1e-9 ? 0 : position;
}

/** The track's value at loop position `t` (0..1) in a loop of `durationSeconds`. */
export function evaluateTrack(track: TimeTrack, t: number, durationSeconds: number): number {
  switch (track.track) {
    case 'wave':
      return Math.sin(2 * Math.PI * ((track.cycles ?? 1) * t + (track.phase ?? 0)));
    case 'step':
      return (track.stride ?? 1) * Math.floor(t * durationSeconds * track.fps + 1e-9);
    case 'pulse':
      return track.at.some((start) => {
        const elapsed = (((t - start) % 1) + 1) % 1;
        return elapsed < track.length;
      })
        ? 1
        : 0;
  }
}
