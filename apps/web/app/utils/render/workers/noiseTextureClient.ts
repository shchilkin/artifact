import { beginRenderWorkerJob, recordRenderWorkerFailure, recordRenderWorkerFallback } from './diagnostics';
import { generateNoiseTextureData, type NoiseTextureRequest, type NoiseTextureResult } from './noiseTexture';

type NoiseTextureWorkerResponse =
  | {
      id: number;
      result: NoiseTextureResult;
    }
  | {
      id: number;
      error: string;
    };

type PendingRequest = {
  resolve: (result: NoiseTextureResult) => void;
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

function runFallback(request: NoiseTextureRequest) {
  const startedAt = now();
  const result = generateNoiseTextureData(request);
  recordRenderWorkerFallback(now() - startedAt);
  return result;
}

function clearPendingWithFallback() {
  for (const request of pending.values()) {
    request.reject();
  }
  pending.clear();
}

function getNoiseTextureWorker() {
  if (!supportsWorker()) return null;
  if (worker) return worker;

  worker = new Worker(new URL('./noiseTexture.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<NoiseTextureWorkerResponse>) => {
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

export async function renderNoiseTexture(request: NoiseTextureRequest): Promise<NoiseTextureResult> {
  const currentWorker = getNoiseTextureWorker();
  if (!currentWorker) return runFallback(request);

  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<NoiseTextureResult>((resolve) => {
    let settled = false;
    const finish = beginRenderWorkerJob();
    const rejectWithFallback = () => {
      if (settled) return;
      settled = true;
      pending.delete(id);
      finish();
      resolve(runFallback(request));
    };

    const timeout = window.setTimeout(rejectWithFallback, WORKER_TIMEOUT_MS);
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
        rejectWithFallback();
      },
    });

    currentWorker.postMessage({ id, request });
  });
}
