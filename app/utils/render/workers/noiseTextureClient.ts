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
  reject: (error: Error) => void;
};

const WORKER_TIMEOUT_MS = 10_000;

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function supportsWorker() {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

function clearPendingWithFallback() {
  for (const [id, request] of pending.entries()) {
    request.reject(new Error(`Noise texture worker unavailable for request ${id}`));
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
      request.reject(new Error(response.error));
    } else {
      request.resolve(response.result);
    }
  });
  worker.addEventListener('error', () => {
    worker?.terminate();
    worker = null;
    clearPendingWithFallback();
  });

  return worker;
}

export async function renderNoiseTexture(request: NoiseTextureRequest): Promise<NoiseTextureResult> {
  const currentWorker = getNoiseTextureWorker();
  if (!currentWorker) return generateNoiseTextureData(request);

  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<NoiseTextureResult>((resolve) => {
    const rejectWithFallback = () => {
      pending.delete(id);
      resolve(generateNoiseTextureData(request));
    };

    const timeout = window.setTimeout(rejectWithFallback, WORKER_TIMEOUT_MS);
    pending.set(id, {
      resolve: (result) => {
        window.clearTimeout(timeout);
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
