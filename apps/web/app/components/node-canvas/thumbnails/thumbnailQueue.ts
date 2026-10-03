import { THUMB_DEBOUNCE_MS } from '../constants';
import type { ThumbnailRenderTask } from '../types';

const THUMBNAIL_RENDER_MEASURE = 'artifact:thumbnail-render';
export const THUMBNAIL_PRELOAD_MEASURE = 'artifact:thumbnail-preload';
export const THUMBNAIL_GRAPH_RENDER_MEASURE = 'artifact:thumbnail-graph-render';
export const THUMBNAIL_DRAW_MEASURE = 'artifact:thumbnail-draw';

export type { ThumbnailRenderTask };
export { THUMB_DEBOUNCE_MS };

export interface ThumbnailQueueSnapshot {
  queued: number;
  active: boolean;
  activeTaskKey: string | null;
  totalScheduled: number;
  completed: number;
  lastDurationMs: number;
  averageDurationMs: number;
}

/** Selected and output previews first, then previews in the viewport, then previews near it. */
type ThumbnailRank = 0 | 1 | 2;

interface QueuedThumbnailRender {
  task: ThumbnailRenderTask;
  rank: ThumbnailRank;
  order: number;
}

const thumbnailRenderQueue = new Map<string, QueuedThumbnailRender>();
let thumbnailRenderActive = false;
let thumbnailDrainScheduled = false;
let thumbnailRenderOrder = 0;
let thumbnailActiveTaskKey: string | null = null;
let thumbnailTotalScheduled = 0;
let thumbnailCompleted = 0;
let thumbnailLastDurationMs = 0;
let thumbnailTotalDurationMs = 0;
const thumbnailQueueListeners = new Set<() => void>();
let thumbnailQueueSnapshot = createThumbnailQueueSnapshot();

export function getThumbnailQueueSnapshot(): ThumbnailQueueSnapshot {
  return thumbnailQueueSnapshot;
}

function createThumbnailQueueSnapshot(): ThumbnailQueueSnapshot {
  return {
    queued: thumbnailRenderQueue.size,
    active: thumbnailRenderActive,
    activeTaskKey: thumbnailActiveTaskKey,
    totalScheduled: thumbnailTotalScheduled,
    completed: thumbnailCompleted,
    lastDurationMs: thumbnailLastDurationMs,
    averageDurationMs: thumbnailCompleted > 0 ? thumbnailTotalDurationMs / thumbnailCompleted : 0,
  };
}

export function subscribeThumbnailQueue(listener: () => void) {
  thumbnailQueueListeners.add(listener);
  return () => thumbnailQueueListeners.delete(listener);
}

export function resetThumbnailQueueDiagnostics() {
  thumbnailRenderQueue.clear();
  thumbnailRenderActive = false;
  thumbnailDrainScheduled = false;
  thumbnailRenderOrder = 0;
  thumbnailActiveTaskKey = null;
  thumbnailTotalScheduled = 0;
  thumbnailCompleted = 0;
  thumbnailLastDurationMs = 0;
  thumbnailTotalDurationMs = 0;
  emitThumbnailQueueChange();
}

function emitThumbnailQueueChange() {
  thumbnailQueueSnapshot = createThumbnailQueueSnapshot();
  thumbnailQueueListeners.forEach((listener) => listener());
}

function queueHasUrgentWork() {
  for (const queued of thumbnailRenderQueue.values()) {
    if (queued.rank > 0) return true;
  }
  return false;
}

function pickNextTask() {
  let next: [string, QueuedThumbnailRender] | undefined;
  for (const entry of thumbnailRenderQueue.entries()) {
    const [, queued] = entry;
    if (!next || queued.rank > next[1].rank || (queued.rank === next[1].rank && queued.order < next[1].order)) {
      next = entry;
    }
  }
  return next;
}

function requestIdleDrain(callback: () => void) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(callback, { timeout: 250 });
    return;
  }
  setTimeout(callback, 48);
}

function scheduleThumbnailQueueDrain(urgent = false) {
  if (thumbnailRenderActive || thumbnailRenderQueue.size === 0) return;
  if (thumbnailDrainScheduled && !urgent) return;
  thumbnailDrainScheduled = true;
  const run = () => {
    thumbnailDrainScheduled = false;
    drainThumbnailRenderQueue();
  };
  if (urgent) {
    setTimeout(run, 0);
    return;
  }
  requestIdleDrain(run);
}

function drainThumbnailRenderQueue() {
  if (thumbnailRenderActive || thumbnailRenderQueue.size === 0) return;
  thumbnailRenderActive = true;
  const nextEntry = pickNextTask();
  if (!nextEntry) {
    thumbnailRenderActive = false;
    return;
  }
  const [taskKey, next] = nextEntry;
  thumbnailRenderQueue.delete(taskKey);
  thumbnailActiveTaskKey = taskKey;
  emitThumbnailQueueChange();
  Promise.resolve()
    .then(() => measureThumbnailTask(taskKey, next.task))
    .catch(() => undefined)
    .finally(() => {
      thumbnailRenderActive = false;
      thumbnailActiveTaskKey = null;
      emitThumbnailQueueChange();
      scheduleThumbnailQueueDrain(queueHasUrgentWork());
    });
}

/**
 * Queues a thumbnail render; a newer task for the same key replaces the queued one. `priority` marks the selected or
 * output preview and `visible` a preview inside the viewport: both drain on the next task, highest rank first.
 * Other previews wait for an idle slot.
 */
export function scheduleThumbnailRender(
  taskKey: string,
  task: ThumbnailRenderTask,
  options: { priority?: boolean; visible?: boolean } = {},
) {
  const existing = thumbnailRenderQueue.get(taskKey);
  if (!existing) thumbnailTotalScheduled += 1;
  const requestedRank: ThumbnailRank = options.priority ? 2 : options.visible ? 1 : 0;
  const rank: ThumbnailRank = existing && existing.rank > requestedRank ? existing.rank : requestedRank;
  thumbnailRenderQueue.set(taskKey, {
    task,
    rank,
    order: existing?.order ?? thumbnailRenderOrder++,
  });
  emitThumbnailQueueChange();
  scheduleThumbnailQueueDrain(rank > 0);
}

async function measureThumbnailTask(taskKey: string, task: ThumbnailRenderTask) {
  if (typeof performance === 'undefined') {
    const startedAt = Date.now();
    await task();
    thumbnailLastDurationMs = Date.now() - startedAt;
    thumbnailTotalDurationMs += thumbnailLastDurationMs;
    thumbnailCompleted += 1;
    emitThumbnailQueueChange();
    return;
  }

  const markId = `${THUMBNAIL_RENDER_MEASURE}:${taskKey}:${Math.random().toString(36).slice(2)}`;
  const startMark = `${markId}:start`;
  const endMark = `${markId}:end`;
  try {
    performance.mark(startMark);
    await task();
    performance.mark(endMark);
    const measure = performance.measure(THUMBNAIL_RENDER_MEASURE, startMark, endMark);
    thumbnailLastDurationMs = measure.duration;
    thumbnailTotalDurationMs += measure.duration;
    thumbnailCompleted += 1;
  } finally {
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    emitThumbnailQueueChange();
  }
}
