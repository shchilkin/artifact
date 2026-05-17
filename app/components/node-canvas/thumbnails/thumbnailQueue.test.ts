import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scheduleThumbnailRender, thumbnailRenderQueue } from './thumbnailQueue';

describe('thumbnail render queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    thumbnailRenderQueue.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    thumbnailRenderQueue.clear();
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
});
