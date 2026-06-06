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

export async function renderEffectPixelTransforms(
  request: EffectPixelTransformRequest,
): Promise<EffectPixelTransformResult> {
  if (request.operations.length === 0) return { width: request.width, height: request.height, data: request.data };
  return runEffectPixelWorker(request);
}
