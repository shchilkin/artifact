import type { EffectRequest, EffectResponse } from './effectProtocol';

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
type Pending = {
  id: number;
  bytes: number;
  resolve: (pixels: Uint8Array<ArrayBuffer>) => void;
  reject: (reason: unknown) => void;
};
const createWorker = () => {
  if (typeof Worker === 'undefined') throw new Error('This browser needs Web Worker support to render effects');
  return new Worker(new URL('./effect.worker.ts', import.meta.url), { type: 'module', name: 'artifact-effects' });
};

/** One job owns this worker. Aborting destroys running WASM, not just its result. */
export class EffectClient {
  private worker?: WorkerPort;
  private pending?: Pending;
  private timer?: ReturnType<typeof setTimeout>;
  private nextID = 0;
  private closed = false;
  private readonly abort = () =>
    this.dispose(this.signal?.reason ?? new DOMException('Render cancelled', 'AbortError'));

  constructor(
    private readonly signal?: AbortSignal,
    private readonly factory: () => WorkerPort = createWorker,
    private readonly timeoutMs = 60_000,
  ) {
    if (signal?.aborted) this.closed = true;
    else signal?.addEventListener('abort', this.abort, { once: true });
  }

  run(request: Omit<EffectRequest, 'id'>): Promise<Uint8Array<ArrayBuffer>> {
    if (this.signal?.aborted) return Promise.reject(this.signal.reason);
    if (this.closed) return Promise.reject(new Error('Render worker is closed'));
    if (this.pending) return Promise.reject(new Error('Effect requests must be sequential'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextID;
      this.pending = { id, bytes: request.pixels.byteLength, resolve, reject };
      try {
        if (!this.worker) {
          this.worker = this.factory();
          this.worker.onmessage = (event: MessageEvent<EffectResponse>) => this.receive(event.data);
          this.worker.onerror = () => this.dispose(new Error('Render worker failed. Try opening the project again.'));
          this.worker.onmessageerror = () => this.dispose(new Error('Render worker returned an unreadable result'));
        }
        this.timer = setTimeout(() => this.dispose(new Error('Render effect timed out')), this.timeoutMs);
        this.worker.postMessage({ ...request, id } satisfies EffectRequest, [request.pixels.buffer]);
      } catch (error) {
        this.dispose(error);
      }
    });
  }

  private receive(response: EffectResponse) {
    if (!this.pending || response?.id !== this.pending.id) return;
    if ('error' in response) {
      this.dispose(new Error(response.error));
      return;
    }
    if (!(response.pixels instanceof Uint8Array) || response.pixels.byteLength !== this.pending.bytes) {
      this.dispose(new Error('Render worker returned invalid pixels'));
      return;
    }
    clearTimeout(this.timer);
    const { resolve } = this.pending;
    this.pending = undefined;
    resolve(response.pixels);
  }

  dispose(reason: unknown = new DOMException('Render cancelled', 'AbortError')) {
    this.closed = true;
    this.signal?.removeEventListener('abort', this.abort);
    clearTimeout(this.timer);
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = undefined;
    }
    this.pending?.reject(reason);
    this.pending = undefined;
  }
}
