import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getThumbnailQueueSnapshot,
  resetThumbnailQueueDiagnostics,
  scheduleThumbnailRender,
  subscribeThumbnailQueue,
} from './thumbnailQueue';

describe('thumbnail render queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetThumbnailQueueDiagnostics();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetThumbnailQueueDiagnostics();
  });

  it('defers passive thumbnail work so editing can stay responsive', async () => {
    const calls: string[] = [];

    scheduleThumbnailRender('passive', async () => {
      calls.push('passive');
    });

    await vi.advanceTimersByTimeAsync(47);
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['passive']);
  });

  it('runs priority thumbnail work before older passive work', async () => {
    const calls: string[] = [];

    scheduleThumbnailRender('passive', async () => {
      calls.push('passive');
    });
    scheduleThumbnailRender(
      'active',
      async () => {
        calls.push('active');
      },
      { priority: true },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['active']);

    await vi.advanceTimersByTimeAsync(48);
    expect(calls).toEqual(['active', 'passive']);
  });

  it('publishes queue diagnostics for loading and debug overlays', async () => {
    const changes: number[] = [];
    const unsubscribe = subscribeThumbnailQueue(() => changes.push(getThumbnailQueueSnapshot().queued));
    let finishTask!: () => void;

    scheduleThumbnailRender(
      'slow',
      () =>
        new Promise<void>((resolve) => {
          finishTask = resolve;
        }),
    );

    expect(getThumbnailQueueSnapshot()).toMatchObject({
      queued: 1,
      active: false,
      totalScheduled: 1,
      completed: 0,
    });

    await vi.advanceTimersByTimeAsync(48);
    expect(getThumbnailQueueSnapshot()).toMatchObject({
      queued: 0,
      active: true,
      activeTaskKey: 'slow',
    });

    finishTask();
    await vi.runAllTimersAsync();
    expect(getThumbnailQueueSnapshot()).toMatchObject({
      queued: 0,
      active: false,
      activeTaskKey: null,
      completed: 1,
    });
    expect(changes.length).toBeGreaterThan(0);

    unsubscribe();
  });
});
