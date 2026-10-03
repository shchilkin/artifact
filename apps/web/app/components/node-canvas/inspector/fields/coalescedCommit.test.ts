import { describe, expect, it, vi } from 'vitest';

import { createCoalescedCommit } from './coalescedCommit';

function setup() {
  let clock = 0;
  const timers: Array<{ at: number; callback: () => void; cleared: boolean }> = [];
  const commit = vi.fn();
  const onPendingChange = vi.fn();
  const coalesced = createCoalescedCommit({
    intervalMs: 66,
    commit,
    onPendingChange,
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
  });
  const advanceTo = (time: number) => {
    for (const timer of timers.filter((item) => !item.cleared && item.at <= time).sort((a, b) => a.at - b.at)) {
      clock = timer.at;
      timer.cleared = true;
      timer.callback();
    }
    clock = time;
  };
  return { coalesced, commit, onPendingChange, advanceTo };
}

describe('createCoalescedCommit', () => {
  it('passes a value after a pause on at once', () => {
    const { coalesced, commit, onPendingChange } = setup();

    coalesced.change(3);

    expect(commit).toHaveBeenCalledWith(3);
    expect(onPendingChange).not.toHaveBeenCalled();
  });

  it('coalesces a drag into one value per interval and always delivers the latest', () => {
    const { coalesced, commit, onPendingChange, advanceTo } = setup();

    // A 20-step drag, one step every 33 ms.
    for (let step = 0; step < 20; step += 1) {
      advanceTo(step * 33);
      coalesced.change(step);
    }
    advanceTo(2000);

    expect(commit.mock.calls.length).toBeLessThanOrEqual(11);
    expect(commit).toHaveBeenLastCalledWith(19);
    expect(onPendingChange).toHaveBeenLastCalledWith(null);
  });

  it('delivers a waiting value on flush and not again when its timer was due', () => {
    const { coalesced, commit, advanceTo } = setup();

    coalesced.change(1);
    advanceTo(10);
    coalesced.change(2);
    coalesced.flush();
    advanceTo(1000);

    expect(commit.mock.calls).toEqual([[1], [2]]);
  });
});
