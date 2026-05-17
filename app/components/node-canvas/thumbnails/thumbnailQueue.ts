import { THUMB_DEBOUNCE_MS } from '../constants';
import type { ThumbnailRenderTask } from '../types';

export type { ThumbnailRenderTask };
export { THUMB_DEBOUNCE_MS };

interface QueuedThumbnailRender {
  task: ThumbnailRenderTask;
  priority: boolean;
  order: number;
}

export const thumbnailRenderQueue = new Map<string, QueuedThumbnailRender>();
let thumbnailRenderActive = false;
let thumbnailDrainScheduled = false;
let thumbnailRenderOrder = 0;

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
  Promise.resolve()
    .then(next.task)
    .catch(() => undefined)
    .finally(() => {
      thumbnailRenderActive = false;
      scheduleThumbnailQueueDrain(queueHasPriorityWork());
    });
}

export function scheduleThumbnailRender(
  taskKey: string,
  task: ThumbnailRenderTask,
  options: { priority?: boolean } = {},
) {
  const existing = thumbnailRenderQueue.get(taskKey);
  thumbnailRenderQueue.set(taskKey, {
    task,
    priority: Boolean(options.priority) || Boolean(existing?.priority),
    order: existing?.order ?? thumbnailRenderOrder++,
  });
  scheduleThumbnailQueueDrain(Boolean(options.priority));
}
