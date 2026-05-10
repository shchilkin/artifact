import { THUMB_DEBOUNCE_MS } from '../constants';
import type { ThumbnailRenderTask } from '../types';

export { THUMB_DEBOUNCE_MS };
export type { ThumbnailRenderTask };

export const thumbnailRenderQueue = new Map<string, ThumbnailRenderTask>();
let thumbnailRenderActive = false;

export function drainThumbnailRenderQueue() {
  if (thumbnailRenderActive || thumbnailRenderQueue.size === 0) return;
  thumbnailRenderActive = true;
  const nextEntry = thumbnailRenderQueue.entries().next().value as [string, ThumbnailRenderTask] | undefined;
  if (!nextEntry) {
    thumbnailRenderActive = false;
    return;
  }
  const [taskKey, next] = nextEntry;
  thumbnailRenderQueue.delete(taskKey);
  Promise.resolve()
    .then(next)
    .catch(() => undefined)
    .finally(() => {
      thumbnailRenderActive = false;
      drainThumbnailRenderQueue();
    });
}

export function scheduleThumbnailRender(taskKey: string, task: ThumbnailRenderTask) {
  thumbnailRenderQueue.set(taskKey, task);
  drainThumbnailRenderQueue();
}
