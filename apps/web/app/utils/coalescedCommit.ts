import { browserTimerClock, type TimerClock } from './timerClock';

/**
 * Passes continuous values on at most every `intervalMs`: a value after a pause goes through at once, values
 * within the interval are coalesced into the latest, which goes through when the interval ends or on `flush`.
 * Each value carries the commit it belongs to, so a waiting value is never passed to a later target.
 */
export interface CoalescedCommitOptions {
  intervalMs: number;
  /** A value is waiting (`value`) or no longer waiting (`null`). */
  onPendingChange?: (value: number | null) => void;
  clock?: TimerClock;
}

export interface CoalescedCommit {
  change: (value: number, commit: (value: number) => void) => void;
  /** Passes on a waiting value now, for example when the gesture ends or the target changes. */
  flush: () => void;
}

export function createCoalescedCommit({
  intervalMs,
  onPendingChange,
  clock = browserTimerClock,
}: CoalescedCommitOptions): CoalescedCommit {
  let pending: { value: number; commit: (value: number) => void } | null = null;
  let lastCommitAt = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;

  function commitNow(value: number, commit: (value: number) => void) {
    const wasPending = pending !== null;
    pending = null;
    lastCommitAt = clock.now();
    commit(value);
    if (wasPending) onPendingChange?.(null);
  }

  function commitPending() {
    if (pending) commitNow(pending.value, pending.commit);
  }

  function flush() {
    if (timer !== null) clock.clearTimer(timer);
    timer = null;
    commitPending();
  }

  function change(value: number, commit: (value: number) => void) {
    const wait = lastCommitAt + intervalMs - clock.now();
    if (wait <= 0 && timer === null) {
      commitNow(value, commit);
      return;
    }
    pending = { value, commit };
    onPendingChange?.(value);
    timer ??= clock.setTimer(
      () => {
        timer = null;
        commitPending();
      },
      Math.max(0, wait),
    );
  }

  return { change, flush };
}
