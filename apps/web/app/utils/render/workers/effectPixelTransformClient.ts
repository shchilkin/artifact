import { beginRenderWorkerJob, recordRenderWorkerFailure, recordRenderWorkerFallback } from './diagnostics';
import {
  type EffectPixelTransformRequest,
  type EffectPixelTransformResult,
  transformEffectPixels,
} from './effectPixelTransform';

type EffectPixelWorkerResponse =
  | {
      id: number;
      result: EffectPixelTransformResult;
    }
  | {
      id: number;
      error: string;
    };

type PendingRequest = {
  resolve: (result: EffectPixelTransformResult) => void;
  reject: () => void;
};

const WORKER_TIMEOUT_MS = 10_000;

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function supportsWorker() {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

function runFallback(request: EffectPixelTransformRequest) {
  const startedAt = now();
  const result = transformEffectPixels(request);
  recordRenderWorkerFallback(now() - startedAt);
  return result;
}

function clearPendingWithFallback() {
  for (const request of pending.values()) {
    request.reject();
  }
  pending.clear();
}

function getEffectPixelWorker() {
  if (!supportsWorker()) return null;
  if (worker) return worker;

  worker = new Worker(new URL('./effectPixelTransform.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<EffectPixelWorkerResponse>) => {
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

export async function renderEffectPixelTransforms(
  request: EffectPixelTransformRequest,
): Promise<EffectPixelTransformResult> {
  if (request.operations.length === 0) return { width: request.width, height: request.height, data: request.data };

  const currentWorker = getEffectPixelWorker();
  if (!currentWorker) return runFallback(request);

  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<EffectPixelTransformResult>((resolve) => {
    let settled = false;
    const finish = beginRenderWorkerJob();
    const fallbackData = new Uint8ClampedArray(request.data);
    const resolveFallback = () => {
      if (settled) return;
      settled = true;
      pending.delete(id);
      finish();
      resolve(runFallback({ ...request, data: fallbackData }));
    };

    const timeout = window.setTimeout(resolveFallback, WORKER_TIMEOUT_MS);
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

    currentWorker.postMessage({ id, request }, [request.data.buffer]);
  });
}
