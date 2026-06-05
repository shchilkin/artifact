import { beginRenderWorkerJob, recordRenderWorkerFailure, recordRenderWorkerFallback } from './diagnostics';

type WorkerResponse<TResult> =
  | {
      id: number;
      result: TResult;
    }
  | {
      id: number;
      error: string;
    };

type PendingRequest<TResult> = {
  resolve: (result: TResult) => void;
  reject: () => void;
};

interface RenderWorkerClientOptions<TRequest, TResult> {
  createWorker: () => Worker;
  runFallback: (request: TRequest) => TResult;
  fallbackRequest?: (request: TRequest) => TRequest;
  transfer?: (request: TRequest) => Transferable[];
  timeoutMs?: number;
}

const DEFAULT_WORKER_TIMEOUT_MS = 10_000;

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function supportsWorker() {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

export function createRenderWorkerClient<TRequest, TResult>({
  createWorker,
  fallbackRequest = (request) => request,
  runFallback,
  timeoutMs = DEFAULT_WORKER_TIMEOUT_MS,
  transfer,
}: RenderWorkerClientOptions<TRequest, TResult>) {
  let worker: Worker | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, PendingRequest<TResult>>();

  function runFallbackWithDiagnostics(request: TRequest) {
    const startedAt = now();
    const result = runFallback(request);
    recordRenderWorkerFallback(now() - startedAt);
    return result;
  }

  function clearPendingWithFallback() {
    for (const request of pending.values()) {
      request.reject();
    }
    pending.clear();
  }

  function getWorker() {
    if (!supportsWorker()) return null;
    if (worker) return worker;

    worker = createWorker();
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse<TResult>>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if ('error' in response) {
        request.reject();
      } else {
        request.resolve(response.result);
      }
    });
    worker.addEventListener('error', () => {
      worker?.terminate();
      worker = null;
      recordRenderWorkerFailure();
      clearPendingWithFallback();
    });

    return worker;
  }

  return async function runInWorker(request: TRequest): Promise<TResult> {
    const currentWorker = getWorker();
    if (!currentWorker) return runFallbackWithDiagnostics(request);

    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise<TResult>((resolve) => {
      let settled = false;
      const finish = beginRenderWorkerJob();
      const fallback = fallbackRequest(request);
      const resolveFallback = () => {
        if (settled) return;
        settled = true;
        pending.delete(id);
        finish();
        resolve(runFallbackWithDiagnostics(fallback));
      };

      const timeout = window.setTimeout(resolveFallback, timeoutMs);
      pending.set(id, {
        resolve: (result) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          finish();
          resolve(result);
        },
        reject: () => {
          window.clearTimeout(timeout);
          resolveFallback();
        },
      });

      const transferables = transfer?.(request);
      currentWorker.postMessage({ id, request }, transferables ?? []);
    });
  };
}
