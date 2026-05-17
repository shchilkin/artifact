import { THUMB_DEBOUNCE_MS } from '../constants';
import type { ThumbnailRenderTask } from '../types';

export const THUMBNAIL_RENDER_MEASURE = 'artifact:thumbnail-render';

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

interface QueuedThumbnailRender {
  task: ThumbnailRenderTask;
  priority: boolean;
  order: number;
}

export const thumbnailRenderQueue = new Map<string, QueuedThumbnailRender>();
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

function queueHasPriorityWork() {
  for (const queued of thumbnailRenderQueue.values()) {
    if (queued.priority) return true;
  }
  return false;
}

function pickNextTask() {
  let fallback: [string, QueuedThumbnailRender] | undefined;
  let priority: [string, QueuedThumbnailRender] | undefined;

  for (const entry of thumbnailRenderQueue.entries()) {
    if (!fallback || entry[1].order < fallback[1].order) fallback = entry;
    if (entry[1].priority && (!priority || entry[1].order < priority[1].order)) priority = entry;
  }

  return priority ?? fallback;
}

function requestIdleDrain(callback: () => void) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(callback, { timeout: 250 });
    return;
  }
  setTimeout(callback, 48);
}

function scheduleThumbnailQueueDrain(priority = false) {
  if (thumbnailRenderActive || thumbnailRenderQueue.size === 0) return;
  if (thumbnailDrainScheduled && !priority) return;
  thumbnailDrainScheduled = true;
  const run = () => {
    thumbnailDrainScheduled = false;
    drainThumbnailRenderQueue();
  };
  if (priority) {
    setTimeout(run, 0);
    return;
  }
  requestIdleDrain(run);
}

export function drainThumbnailRenderQueue() {
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
      scheduleThumbnailQueueDrain(queueHasPriorityWork());
    });
}

export function scheduleThumbnailRender(
  taskKey: string,
  task: ThumbnailRenderTask,
  options: { priority?: boolean } = {},
) {
  const existing = thumbnailRenderQueue.get(taskKey);
  if (!existing) thumbnailTotalScheduled += 1;
  thumbnailRenderQueue.set(taskKey, {
    task,
    priority: Boolean(options.priority) || Boolean(existing?.priority),
    order: existing?.order ?? thumbnailRenderOrder++,
  });
  emitThumbnailQueueChange();
  scheduleThumbnailQueueDrain(Boolean(options.priority));
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
