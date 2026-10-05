import { describe, expect, it, vi } from 'vitest';

import { createFakeTimerClock } from '../test-fixtures/fakeTimerClock';
import { createCoalescedCommit } from './coalescedCommit';

function setup() {
  const { clock, advanceTo } = createFakeTimerClock();
  const onPendingChange = vi.fn();
  const coalesced = createCoalescedCommit({ intervalMs: 66, onPendingChange, clock });
  return { coalesced, onPendingChange, advanceTo };
}

describe('createCoalescedCommit', () => {
  it('passes a value after a pause on at once', () => {
    const { coalesced, onPendingChange } = setup();
    const commit = vi.fn();

    coalesced.change(3, commit);

    expect(commit).toHaveBeenCalledWith(3);
    expect(onPendingChange).not.toHaveBeenCalled();
  });

  it('coalesces a drag into one value per interval and always delivers the latest', () => {
    const { coalesced, onPendingChange, advanceTo } = setup();
    const commit = vi.fn();

    // A 20-step drag, one step every 33 ms.
    for (let step = 0; step < 20; step += 1) {
      advanceTo(step * 33);
      coalesced.change(step, commit);
    }
    advanceTo(2000);

    expect(commit.mock.calls.length).toBeLessThanOrEqual(11);
    expect(commit).toHaveBeenLastCalledWith(19);
    expect(onPendingChange).toHaveBeenLastCalledWith(null);
  });

  it('delivers a waiting value on flush and not again when its timer was due', () => {
    const { coalesced, advanceTo } = setup();
    const commit = vi.fn();

    coalesced.change(1, commit);
    advanceTo(10);
    coalesced.change(2, commit);
    coalesced.flush();
    advanceTo(1000);

    expect(commit.mock.calls).toEqual([[1], [2]]);
  });

  it('delivers a waiting value to the commit it was changed with', () => {
    const { coalesced, advanceTo } = setup();
    const commitToA = vi.fn();
    const commitToB = vi.fn();

    coalesced.change(1, commitToA);
    advanceTo(10);
    coalesced.change(2, commitToA);
    // The target changes before the interval ends: the waiting value still belongs to A.
    coalesced.flush();
    coalesced.change(7, commitToB);
    advanceTo(1000);

    expect(commitToA.mock.calls).toEqual([[1], [2]]);
    expect(commitToB.mock.calls).toEqual([[7]]);
  });
});
