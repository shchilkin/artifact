/**
 * Latest-wins scheduling for a preview surface that renders from refs (the render reads the newest document when
 * it starts, so a request carries no payload).
 *
 * - Requests made while a start is already scheduled coalesce into that start.
 * - A request made while a render runs calls `onSupersede` (which may abort the render) and leaves exactly one
 *   pending render, which starts when the running one finishes. A continuous gesture therefore never has more than
 *   one render in flight and one waiting, however many inputs it delivers.
 * - After a render that asks for a cooldown, the next one waits until the main thread has been free for
 *   `cooldownRatio` times that render's duration (at most `maxCooldownMs`), so input keeps flowing while renders are
 *   expensive. The wait ends early once requests stop for twice their recent interval (at least `quietMs`): when a
 *   gesture ends, its last state renders at once. A request after an idle period starts on the next microtask.
 */
export interface PreviewRenderSchedulerOptions {
  /**
   * Starts one render. The render must call `done` exactly once when it settles, including on abort or error, and
   * pass `cooldown: false` when the next render does not need to leave the main thread free first.
   */
  run: (done: (options?: { cooldown?: boolean }) => void) => void;
  /** A newer request arrived while a render was running. */
  onSupersede?: () => void;
  /** Free time left between consecutive renders, as a multiple of the previous render's duration. */
  cooldownRatio?: number;
  maxCooldownMs?: number;
  /** Shortest gap between requests that counts as the end of continuous input. */
  quietMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  queueMicrotask?: (callback: () => void) => void;
}

export interface PreviewRenderScheduler {
  request: () => void;
  /** Drops a scheduled or pending start (the running render, if any, continues). */
  cancelScheduled: () => void;
  readonly running: boolean;
  readonly pending: boolean;
}

export const DEFAULT_PREVIEW_COOLDOWN_RATIO = 2;
const DEFAULT_MAX_COOLDOWN_MS = 250;
const DEFAULT_QUIET_MS = 34;

export function createPreviewRenderScheduler({
  run,
  onSupersede,
  cooldownRatio = DEFAULT_PREVIEW_COOLDOWN_RATIO,
  maxCooldownMs = DEFAULT_MAX_COOLDOWN_MS,
  quietMs = DEFAULT_QUIET_MS,
  now = () => performance.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  queueMicrotask: enqueueMicrotask = (callback) => queueMicrotask(callback),
}: PreviewRenderSchedulerOptions): PreviewRenderScheduler {
  let running = false;
  let pending = false;
  let scheduled = false;
  let timer: unknown = null;
  let generation = 0;
  let startedAt = 0;
  let cooldownUntil = Number.NEGATIVE_INFINITY;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let requestIntervalMs = 0;

  function start(scheduledGeneration: number) {
    if (scheduledGeneration !== generation || !scheduled) return;
    scheduled = false;
    timer = null;
    running = true;
    startedAt = now();
    let settled = false;
    run((options) => {
      if (settled) return;
      settled = true;
      finish(options?.cooldown ?? true);
    });
  }

  function finish(cooldown: boolean) {
    running = false;
    const endedAt = now();
    cooldownUntil = cooldown
      ? endedAt + Math.min(maxCooldownMs, Math.max(0, endedAt - startedAt) * cooldownRatio)
      : Number.NEGATIVE_INFINITY;
    if (!pending) return;
    pending = false;
    schedule();
  }

  /** Time left before a start may happen: the cooldown, unless input has gone quiet first. */
  function waitMs() {
    const current = now();
    if (current >= cooldownUntil) return 0;
    const quietAt = lastRequestAt + Math.max(quietMs, requestIntervalMs * 2);
    return current >= quietAt ? 0 : Math.min(cooldownUntil, quietAt) - current;
  }

  function armTimer(scheduledGeneration: number) {
    const wait = waitMs();
    if (wait <= 0) {
      start(scheduledGeneration);
      return;
    }
    timer = setTimer(() => {
      if (scheduledGeneration === generation && scheduled) armTimer(scheduledGeneration);
    }, wait);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const scheduledGeneration = generation;
    if (waitMs() > 0) {
      armTimer(scheduledGeneration);
      return;
    }
    enqueueMicrotask(() => start(scheduledGeneration));
  }

  function request() {
    const requestedAt = now();
    const interval = requestedAt - lastRequestAt;
    // Smoothed gap between requests of the current burst; a long gap starts a new burst.
    requestIntervalMs = interval > maxCooldownMs ? 0 : requestIntervalMs * 0.7 + interval * 0.3;
    lastRequestAt = requestedAt;
    if (running) {
      pending = true;
      onSupersede?.();
      return;
    }
    schedule();
  }

  function cancelScheduled() {
    generation += 1;
    scheduled = false;
    pending = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  return {
    request,
    cancelScheduled,
    get running() {
      return running;
    },
    get pending() {
      return pending || scheduled;
    },
  };
}
