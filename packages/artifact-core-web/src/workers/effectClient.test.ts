import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectClient } from './effectClient';

function harness(signal?: AbortSignal) {
  const worker = {
    onmessage: null as Worker['onmessage'],
    onerror: null as Worker['onerror'],
    onmessageerror: null as Worker['onmessageerror'],
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const create = vi.fn(() => worker);
  const client = new EffectClient(signal, create, 100);
  const input = () => ({ pixels: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1, layerJSON: '{}', seed: 4242 });
  const reply = (data: unknown) => worker.onmessage?.call(worker as unknown as Worker, { data } as MessageEvent);
  return { worker, create, client, input, reply };
}

afterEach(() => vi.useRealTimers());

describe('EffectClient render-job lifecycle', () => {
  it('transfers buffers and reuses one worker for sequential effects', async () => {
    const h = harness();
    const request = h.input();
    const first = h.client.run(request);
    expect(h.worker.postMessage).toHaveBeenCalledWith({ ...request, id: 1 }, [request.pixels.buffer]);
    const result = new Uint8Array([5, 6, 7, 8]);
    h.reply({ id: 1, pixels: result });
    expect(await first).toBe(result);
    const second = h.client.run(h.input());
    h.reply({ id: 1, pixels: new Uint8Array(4) }); // Late previous message cannot satisfy this request.
    h.reply({ id: 2, pixels: result });
    expect(await second).toBe(result);
    expect(h.create).toHaveBeenCalledTimes(1);
    h.client.dispose();
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('does not allocate a worker for an already-cancelled render', async () => {
    const controller = new AbortController();
    controller.abort();
    const h = harness(controller.signal);
    await expect(h.client.run(h.input())).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('terminates in-flight work immediately on abort and rejects late work', async () => {
    const controller = new AbortController();
    const h = harness(controller.signal);
    const result = h.client.run(h.input());
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect(h.worker.onmessage).toBeNull();
    await expect(h.client.run(h.input())).rejects.toMatchObject({ name: 'AbortError' });
    h.client.dispose();
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent use instead of queueing obsolete render jobs', async () => {
    const h = harness();
    const first = h.client.run(h.input());
    await expect(h.client.run(h.input())).rejects.toThrow('sequential');
    h.reply({ id: 1, pixels: new Uint8Array(4) });
    await first;
    h.client.dispose();
  });

  it.each([
    'error',
    'invalid pixels',
    'worker error',
    'message error',
    'timeout',
  ])('cleans up after %s', async (kind) => {
    vi.useFakeTimers();
    const h = harness();
    const result = h.client.run(h.input());
    const rejected = expect(result).rejects.toBeInstanceOf(Error);
    if (kind === 'error') h.reply({ id: 1, error: 'Unsupported effect' });
    if (kind === 'invalid pixels') h.reply({ id: 1, pixels: new Uint8Array(3) });
    if (kind === 'worker error')
      h.worker.onerror?.call(h.worker as unknown as Worker, new Event('error') as ErrorEvent);
    if (kind === 'message error')
      h.worker.onmessageerror?.call(h.worker as unknown as Worker, new Event('messageerror') as MessageEvent);
    if (kind === 'timeout') vi.advanceTimersByTime(100);
    await rejected;
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(h.client.run(h.input())).rejects.toThrow('closed');
  });

  it('settles startup and transfer failures without leaving a pending timer', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.worker.postMessage.mockImplementation(() => {
      throw new Error('Transfer failed');
    });
    await expect(h.client.run(h.input())).rejects.toThrow('Transfer failed');
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const unavailable = new EffectClient(undefined, () => {
      throw new Error('Workers unavailable');
    });
    await expect(unavailable.run(h.input())).rejects.toThrow('Workers unavailable');
    unavailable.dispose();
  });
});
