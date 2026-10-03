/**
 * Latest-wins scheduling for a preview surface that renders from refs (the render reads the newest document when
 * it starts, so a request carries no payload).
 *
 * - Requests made while a start is already scheduled coalesce into that start.
 * - A request made while a render runs supersedes it (`onSupersede` aborts it) and leaves exactly one pending
 *   render, which starts when the running one finishes. A continuous gesture therefore never has more than one
 *   render in flight and one waiting, however many inputs it delivers.
 * - Between consecutive renders the scheduler leaves the main thread free for `cooldownRatio` times the previous
 *   render's duration, so input keeps flowing while renders are expensive. A request after an idle period starts
 *   on the next microtask.
 */
export interface PreviewRenderSchedulerOptions {
  /** Starts one render. The render must call `done` exactly once when it settles, including on abort or error. */
  run: (done: () => void) => void;
  /** A newer request arrived while a render was running: abort or mark that render stale. */
  onSupersede?: () => void;
  /** Free time left between consecutive renders, as a multiple of the previous render's duration. */
  cooldownRatio?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  queueMicrotask?: (callback: () => void) => void;
}

export interface PreviewRenderScheduler {
  request: () => void;
  /** Drops a scheduled start (the running render, if any, continues). */
  cancelScheduled: () => void;
  readonly running: boolean;
  readonly pending: boolean;
}

export const DEFAULT_PREVIEW_COOLDOWN_RATIO = 2;

export function createPreviewRenderScheduler({
  run,
  onSupersede,
  cooldownRatio = DEFAULT_PREVIEW_COOLDOWN_RATIO,
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
  let earliestNextStart = Number.NEGATIVE_INFINITY;

  function start(scheduledGeneration: number) {
    if (scheduledGeneration !== generation || !scheduled) return;
    scheduled = false;
    timer = null;
    running = true;
    startedAt = now();
    let settled = false;
    run(() => {
      if (settled) return;
      settled = true;
      finish();
    });
  }

  function finish() {
    running = false;
    const endedAt = now();
    earliestNextStart = endedAt + Math.max(0, endedAt - startedAt) * cooldownRatio;
    if (!pending) return;
    pending = false;
    request();
  }

  function request() {
    if (running) {
      if (!pending) pending = true;
      onSupersede?.();
      return;
    }
    if (scheduled) return;
    scheduled = true;
    const scheduledGeneration = generation;
    const waitMs = earliestNextStart - now();
    if (waitMs > 0) {
      timer = setTimer(() => start(scheduledGeneration), waitMs);
      return;
    }
    enqueueMicrotask(() => start(scheduledGeneration));
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
