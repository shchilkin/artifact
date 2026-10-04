import {
  type EffectPixelTransformRequest,
  type EffectPixelTransformResult,
  transformEffectPixels,
} from './effectPixelTransform';
import { createRenderWorkerClient } from './workerClient';

const runEffectPixelWorker = createRenderWorkerClient<EffectPixelTransformRequest, EffectPixelTransformResult>({
  createWorker: () => new Worker(new URL('./effectPixelTransform.worker.ts', import.meta.url), { type: 'module' }),
  fallbackRequest: (request) => ({ ...request, data: new Uint8ClampedArray(request.data) }),
  runFallback: transformEffectPixels,
  transfer: (request) => [request.data.buffer],
});

const WORKER_TRANSFORM_MEASURE = 'artifact:worker-transform';

/** Runs Canvas 2D pixel kernels in the worker; each call is one `artifact:worker-transform` measure (round trip). */
export async function renderEffectPixelTransforms(
  request: EffectPixelTransformRequest,
): Promise<EffectPixelTransformResult> {
  if (request.operations.length === 0) return { width: request.width, height: request.height, data: request.data };
  const startedAt = typeof performance === 'undefined' ? 0 : performance.now();
  try {
    return await runEffectPixelWorker(request);
  } finally {
    if (typeof performance !== 'undefined' && typeof performance.measure === 'function') {
      performance.measure(WORKER_TRANSFORM_MEASURE, { start: startedAt, end: performance.now() });
    }
  }
}
