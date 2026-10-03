/**
 * Passes continuous values on at most every `intervalMs`: a value after a pause goes through at once, values
 * within the interval are coalesced into the latest, which goes through when the interval ends or on `flush`.
 */
export interface CoalescedCommitOptions {
  intervalMs: number;
  commit: (value: number) => void;
  /** A value is waiting (`value`) or no longer waiting (`null`). */
  onPendingChange?: (value: number | null) => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface CoalescedCommit {
  change: (value: number) => void;
  /** Passes on a waiting value now, for example when the gesture ends. */
  flush: () => void;
}

export function createCoalescedCommit({
  intervalMs,
  commit,
  onPendingChange,
  now = () => performance.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: CoalescedCommitOptions): CoalescedCommit {
  let pending: number | null = null;
  let lastCommitAt = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;

  function commitNow(value: number) {
    const wasPending = pending !== null;
    pending = null;
    lastCommitAt = now();
    commit(value);
    if (wasPending) onPendingChange?.(null);
  }

  function flush() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (pending !== null) commitNow(pending);
  }

  function change(value: number) {
    const wait = lastCommitAt + intervalMs - now();
    if (wait <= 0 && timer === null) {
      commitNow(value);
      return;
    }
    pending = value;
    onPendingChange?.(value);
    timer ??= setTimer(
      () => {
        timer = null;
        if (pending !== null) commitNow(pending);
      },
      Math.max(0, wait),
    );
  }

  return { change, flush };
}
