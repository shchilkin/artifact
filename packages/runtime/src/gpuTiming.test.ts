import { describe, expect, it, vi } from 'vitest';
import { measureGpuTime } from './gpuTiming.js';

const TIME_ELAPSED_EXT = 0x88bf;
const GPU_DISJOINT_EXT = 0x8fbb;
const QUERY_RESULT = 0x8866;
const QUERY_RESULT_AVAILABLE = 0x8867;

/** A context whose timer queries report `durations` (in nanoseconds) once `framesUntilReady` frames have passed. */
function timerGl(options: {
  extension?: boolean;
  durations?: number[];
  framesUntilReady?: number;
  disjoint?: boolean;
}) {
  const durations = [...(options.durations ?? [])];
  let frames = 0;
  let next = 0;
  const results = new Map<object, number>();
  const calls: string[] = [];
  const gl = {
    QUERY_RESULT,
    QUERY_RESULT_AVAILABLE,
    getExtension: (name: string) =>
      options.extension === false || name !== 'EXT_disjoint_timer_query_webgl2'
        ? null
        : { TIME_ELAPSED_EXT, GPU_DISJOINT_EXT },
    getParameter: (name: number) => (name === GPU_DISJOINT_EXT ? Boolean(options.disjoint) && frames > 0 : null),
    createQuery: () => ({ id: next++ }),
    beginQuery: (target: number, query: object) => {
      expect(target).toBe(TIME_ELAPSED_EXT);
      calls.push('begin');
      results.set(query, durations.shift() ?? 1e6);
    },
    endQuery: () => calls.push('end'),
    flush: () => calls.push('flush'),
    getQueryParameter: (query: object, name: number) => {
      const ready = frames >= (options.framesUntilReady ?? 0);
      return name === QUERY_RESULT_AVAILABLE ? ready : results.get(query);
    },
    deleteQuery: vi.fn(),
  };
  const nextFrame = async () => {
    frames += 1;
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls, nextFrame, deleteQuery: gl.deleteQuery };
}

describe('measureGpuTime', () => {
  it('returns null without the timer query extension, after no renders', async () => {
    const render = vi.fn();
    const { gl } = timerGl({ extension: false });
    expect(await measureGpuTime(gl, render)).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it('warms up untimed, then times one render per query and reports the median in milliseconds', async () => {
    const render = vi.fn();
    const { gl, calls, nextFrame, deleteQuery } = timerGl({
      durations: [3e6, 1e6, 2e6, 9e6, 1.5e6],
      framesUntilReady: 3,
    });
    const timing = await measureGpuTime(gl, render, { samples: 5, warmup: 2, nextFrame });
    expect(render).toHaveBeenCalledTimes(7);
    expect(calls.filter((call) => call === 'begin')).toHaveLength(5);
    expect(timing).toEqual({ medianMs: 2, samples: [3, 1, 2, 9, 1.5] });
    expect(deleteQuery).toHaveBeenCalledTimes(5);
  });

  it('discards samples from a disjoint period', async () => {
    const { gl, nextFrame } = timerGl({ framesUntilReady: 1, disjoint: true });
    expect(await measureGpuTime(gl, () => {}, { samples: 3, nextFrame })).toBeNull();
  });

  it('gives up when results never arrive', async () => {
    const { gl, nextFrame } = timerGl({ framesUntilReady: Number.POSITIVE_INFINITY });
    expect(await measureGpuTime(gl, () => {}, { samples: 2, nextFrame, maxFrames: 4 })).toBeNull();
  });
});
