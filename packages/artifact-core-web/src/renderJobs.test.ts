import { describe, expect, it, vi } from 'vitest';
import { RenderJobs } from './renderJobs';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('render ownership', () => {
  it('publishes the latest preview when older work completes last', async () => {
    const jobs = new RenderJobs();
    const old = deferred<string>();
    const publish = vi.fn();
    const fail = vi.fn();
    let signal!: AbortSignal;
    const first = jobs.run(
      'preview',
      (s) => {
        signal = s;
        return old.promise;
      },
      publish,
      fail,
    );
    await jobs.run('preview', async () => 'new', publish, fail);
    old.resolve('old');
    await first;
    expect(signal.aborted).toBe(true);
    expect(publish.mock.calls).toEqual([['new']]);
    expect(fail).not.toHaveBeenCalled();
  });
  it('invalidates both pending preview and export on a document change, including late PNG encoding', async () => {
    const jobs = new RenderJobs();
    const preview = deferred<string>();
    const encode = deferred<string>();
    const publish = vi.fn();
    const failed = vi.fn();
    const settled = vi.fn();
    const a = jobs.run('preview', () => preview.promise, publish, failed, settled);
    const b = jobs.run('export', () => encode.promise, publish, failed, settled);
    jobs.invalidate();
    preview.resolve('old image');
    encode.resolve('old PNG');
    await Promise.all([a, b]);
    expect(publish).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    await jobs.run('export', async () => 'current PNG', publish, failed, settled);
    expect(publish).toHaveBeenCalledWith('current PNG');
    expect(settled).toHaveBeenCalledOnce();
  });
  it('keeps preview and export independent for the same document', async () => {
    const jobs = new RenderJobs();
    const preview = deferred<number>();
    const publish = vi.fn();
    const failed = vi.fn();
    const a = jobs.run('preview', () => preview.promise, publish, failed);
    await jobs.run('export', async () => 3000, publish, failed);
    preview.resolve(1000);
    await a;
    expect(publish.mock.calls).toEqual([[3000], [1000]]);
  });
  it('reports current failure, permits retry, and ignores failures after cancellation', async () => {
    const jobs = new RenderJobs();
    const failed = vi.fn();
    const publish = vi.fn();
    const settled = vi.fn();
    await jobs.run(
      'export',
      async () => {
        throw new Error('encode');
      },
      publish,
      failed,
      settled,
    );
    expect(failed).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledOnce();
    const old = deferred<string>();
    const a = jobs.run('export', () => old.promise, publish, failed, settled);
    jobs.invalidate();
    old.reject(new Error('cancelled'));
    await a;
    expect(failed).toHaveBeenCalledOnce();
    await jobs.run('export', async () => 'retry', publish, failed);
    expect(publish).toHaveBeenCalledWith('retry');
  });
});
