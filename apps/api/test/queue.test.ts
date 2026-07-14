import { describe, expect, it, vi } from 'vitest';
import { createInMemoryGenerationQueue } from '../src/queue.js';

describe('createInMemoryGenerationQueue', () => {
  it('processes queued generation payloads', async () => {
    const queue = createInMemoryGenerationQueue();
    const handler = vi.fn(async () => undefined);
    const worker = queue.process(handler);

    await queue.enqueue({ kind: 'image', jobId: 'job-1', userId: 'user-1' }, { jobId: 'job-1' });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' })));

    await worker.close();
  });

  it('rejects enqueues after close', async () => {
    const queue = createInMemoryGenerationQueue();

    await queue.close?.();

    await expect(queue.enqueue({ kind: 'image', jobId: 'job-1', userId: 'user-1' })).rejects.toThrow(
      'Cannot enqueue into a closed queue',
    );
  });

  it('processes up to the configured concurrency', async () => {
    const queue = createInMemoryGenerationQueue();
    const releases: Array<() => void> = [];
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const worker = queue.process(handler, { concurrency: 2 });

    await queue.enqueue({ kind: 'image', jobId: 'job-1', userId: 'user-1' }, { jobId: 'job-1' });
    await queue.enqueue({ kind: 'image', jobId: 'job-2', userId: 'user-1' }, { jobId: 'job-2' });
    await queue.enqueue({ kind: 'image', jobId: 'job-3', userId: 'user-1' }, { jobId: 'job-3' });

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(3));

    for (const release of releases) release();
    await worker.close();
  });
});
