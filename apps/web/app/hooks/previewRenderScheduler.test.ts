import { describe, expect, it, vi } from 'vitest';

import { createPreviewRenderScheduler } from './previewRenderScheduler';

function setup(cooldownRatio = 2) {
  let clock = 0;
  const microtasks: Array<() => void> = [];
  const timers: Array<{ at: number; callback: () => void; cleared: boolean }> = [];
  const finishers: Array<(options?: { cooldown?: boolean }) => void> = [];
  const run = vi.fn((done: (options?: { cooldown?: boolean }) => void) => {
    finishers.push(done);
  });
  const onSupersede = vi.fn();
  const scheduler = createPreviewRenderScheduler({
    run,
    onSupersede,
    cooldownRatio,
    now: () => clock,
    setTimer: (callback, ms) => {
      const timer = { at: clock + ms, callback, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      const timer = timers.find((item) => item === handle);
      if (timer) timer.cleared = true;
    },
    queueMicrotask: (callback) => microtasks.push(callback),
  });

  return {
    scheduler,
    run,
    onSupersede,
    flushMicrotasks() {
      while (microtasks.length) microtasks.shift()?.();
    },
    advance(ms: number) {
      clock += ms;
      for (const timer of timers.filter((item) => !item.cleared && item.at <= clock)) {
        timer.cleared = true;
        timer.callback();
      }
    },
    finishRender(afterMs: number, options?: { cooldown?: boolean }) {
      clock += afterMs;
      finishers.shift()?.(options);
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
    const { scheduler, run, onSupersede, flushMicrotasks, finishRender, advance } = setup(0);

    scheduler.request();
    flushMicrotasks();
    for (let step = 0; step < 20; step += 1) scheduler.request();

    expect(onSupersede).toHaveBeenCalledTimes(20);
    expect(scheduler.pending).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    finishRender(30);
    advance(0);
    flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(2);

    finishRender(30);
    flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.pending).toBe(false);
  });

  it('holds the next render for the cooldown during continuous input', () => {
    const { scheduler, run, flushMicrotasks, finishRender, advance } = setup(2);

    scheduler.request();
    flushMicrotasks();
    finishRender(40);
    // 80 ms cooldown; input arrives every 16 ms.
    scheduler.request();
    for (let step = 0; step < 4; step += 1) {
      advance(16);
      scheduler.request();
    }
    flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(1);

    advance(16);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('renders the last state soon after input stops, without waiting out the cooldown', () => {
    const { scheduler, run, flushMicrotasks, finishRender, advance } = setup(2);

    scheduler.request();
    flushMicrotasks();
    scheduler.request();
    finishRender(200);

    // The pending request is 200 ms old, so input is already quiet.
    flushMicrotasks();
    expect(run).toHaveBeenCalledTimes(2);

    finishRender(200);
    scheduler.request();
    advance(33);
    expect(run).toHaveBeenCalledTimes(2);
    advance(1);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('caps the cooldown after a very slow render', () => {
    const { scheduler, run, flushMicrotasks, finishRender, advance } = setup(2);

    scheduler.request();
    flushMicrotasks();
    finishRender(1000);
    for (let elapsed = 0; elapsed < 250; elapsed += 10) {
      scheduler.request();
      advance(10);
    }
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not cool down after a render that opts out', () => {
    const { scheduler, run, flushMicrotasks, finishRender } = setup(2);

    scheduler.request();
    flushMicrotasks();
    finishRender(400, { cooldown: false });
    scheduler.request();
    flushMicrotasks();

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('drops a scheduled start when cancelled', () => {
    const { scheduler, run, flushMicrotasks, finishRender, advance } = setup(2);

    scheduler.request();
    flushMicrotasks();
    finishRender(40);
    scheduler.request();
    scheduler.cancelScheduled();
    advance(1000);
    flushMicrotasks();

    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(false);
  });

  it('ignores a render that reports completion twice', () => {
    const finishers: Array<() => void> = [];
    const microtasks: Array<() => void> = [];
    const run = vi.fn((done: () => void) => finishers.push(done));
    const scheduler = createPreviewRenderScheduler({
      run,
      cooldownRatio: 0,
      now: () => 0,
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
