import { describe, expect, it, vi } from 'vitest';

import { createFakeTimerClock } from '../test-fixtures/fakeTimerClock';
import { createPreviewRenderScheduler } from './previewRenderScheduler';

type Done = (options?: { cooldown?: boolean }) => void;

function setup(cooldownRatio = 2, minIntervalMs = 0) {
  const microtasks: Array<() => void> = [];
  const finishers: Done[] = [];
  const run = vi.fn((done: Done) => {
    finishers.push(done);
  });
  const onSupersede = vi.fn();
  const flushMicrotasks = () => {
    while (microtasks.length) microtasks.shift()?.();
  };
  const { clock, advanceTo: advanceClockTo } = createFakeTimerClock({ afterTimer: flushMicrotasks });
  const scheduler = createPreviewRenderScheduler({
    run,
    onSupersede,
    cooldownRatio,
    minIntervalMs,
    clock,
    queueMicrotask: (callback) => microtasks.push(callback),
  });
  const advanceTo = (time: number) => {
    advanceClockTo(time);
    flushMicrotasks();
  };

  return {
    scheduler,
    run,
    onSupersede,
    flushMicrotasks,
    advanceTo,
    /** Requests at `from`, `from + every`, ... up to and including `to`. */
    requestEvery(from: number, to: number, every: number) {
      for (let time = from; time <= to; time += every) {
        advanceTo(time);
        scheduler.request();
        flushMicrotasks();
      }
    },
    finishRenderAt(time: number, options?: { cooldown?: boolean }) {
      advanceTo(time);
      finishers.shift()?.(options);
      flushMicrotasks();
    },
  };
}

describe('createPreviewRenderScheduler', () => {
  it('starts an idle request on the next microtask and coalesces requests made before it', () => {
    const { scheduler, run, flushMicrotasks } = setup();

    scheduler.request();
    scheduler.request();
    scheduler.request();
    expect(run).not.toHaveBeenCalled();

    flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps one pending render however many requests arrive while a render runs', () => {
    const { scheduler, run, onSupersede, requestEvery, finishRenderAt, advanceTo } = setup(0);

    requestEvery(0, 200, 10);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSupersede).toHaveBeenCalledTimes(20);
    expect(scheduler.pending).toBe(true);

    finishRenderAt(210);
    expect(run).toHaveBeenCalledTimes(2);

    finishRenderAt(260);
    advanceTo(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.pending).toBe(false);
  });

  it('holds the next render for the cooldown while input keeps arriving', () => {
    const { run, requestEvery, finishRenderAt } = setup(2);

    requestEvery(0, 32, 16);
    // A 40 ms render leaves 80 ms free before the next one.
    finishRenderAt(40);
    requestEvery(48, 112, 16);
    expect(run).toHaveBeenCalledTimes(1);

    requestEvery(128, 128, 16);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('spaces cheap renders by the minimum interval while input keeps arriving', () => {
    const { run, requestEvery, finishRenderAt } = setup(2, 66);

    requestEvery(0, 8, 4);
    // A 10 ms render would allow the next start at 30 ms; the minimum interval holds it until 66 ms.
    finishRenderAt(10);
    requestEvery(16, 64, 16);
    expect(run).toHaveBeenCalledTimes(1);

    requestEvery(80, 80, 16);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('renders the last state soon after input stops, without waiting out the cooldown', () => {
    const { run, requestEvery, finishRenderAt, advanceTo } = setup(2);

    requestEvery(0, 96, 16);
    // A 100 ms render: the cooldown would last until 300 ms.
    finishRenderAt(100);
    requestEvery(112, 144, 16);
    expect(run).toHaveBeenCalledTimes(1);

    // Input stopped at 144 ms; it counts as quiet after 34 ms.
    advanceTo(177);
    expect(run).toHaveBeenCalledTimes(1);
    advanceTo(178);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('starts a request that follows a pause without a cooldown, even when it arrived during a render', () => {
    const { scheduler, run, requestEvery, finishRenderAt, advanceTo } = setup(2);

    requestEvery(0, 64, 16);
    finishRenderAt(80);
    advanceTo(1000);
    expect(run).toHaveBeenCalledTimes(2);

    // The full-quality pass asks again 240 ms after the gesture's last input, while a render runs.
    advanceTo(1100);
    scheduler.request();
    requestEvery(1340, 1340, 1);
    finishRenderAt(1400);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('caps the cooldown after a very slow render', () => {
    const { run, requestEvery, finishRenderAt } = setup(2);

    requestEvery(0, 990, 10);
    finishRenderAt(1000);
    requestEvery(1010, 1240, 10);
    expect(run).toHaveBeenCalledTimes(1);

    requestEvery(1250, 1250, 10);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not cool down after a render that opts out', () => {
    const { run, requestEvery, finishRenderAt } = setup(2);

    requestEvery(0, 32, 16);
    finishRenderAt(400, { cooldown: false });

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('drops a scheduled start when cancelled', () => {
    const { scheduler, run, requestEvery, finishRenderAt, advanceTo } = setup(2);

    requestEvery(0, 32, 16);
    finishRenderAt(40);
    requestEvery(48, 48, 16);
    scheduler.cancelScheduled();
    advanceTo(1000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(false);
  });

  it('ignores a render that reports completion twice', () => {
    const finishers: Done[] = [];
    const microtasks: Array<() => void> = [];
    const run = vi.fn((done: Done) => {
      finishers.push(done);
    });
    const scheduler = createPreviewRenderScheduler({
      run,
      cooldownRatio: 0,
      clock: createFakeTimerClock().clock,
      queueMicrotask: (callback) => microtasks.push(callback),
    });

    scheduler.request();
    microtasks.shift()?.();
    scheduler.request();
    finishers[0]();
    finishers[0]();
    microtasks.shift()?.();

    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.running).toBe(true);
  });
});
