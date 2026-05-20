import { describe, expect, it, vi } from 'vitest';
import { createInMemoryGenerationQueue } from '../src/queue.js';

describe('createInMemoryGenerationQueue', () => {
  it('processes queued generation payloads', async () => {
    const queue = createInMemoryGenerationQueue();
    const handler = vi.fn(async () => undefined);
    const worker = queue.process(handler);

    await queue.enqueue({ jobId: 'job-1', userId: 'user-1' }, { jobId: 'job-1' });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' })));

    await worker.close();
  });

  it('rejects enqueues after close', async () => {
    const queue = createInMemoryGenerationQueue();

    await queue.close?.();

    await expect(queue.enqueue({ jobId: 'job-1', userId: 'user-1' })).rejects.toThrow(
      'Cannot enqueue into a closed queue',
    );
  });
});
