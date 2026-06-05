import { generateNoiseTextureData, type NoiseTextureRequest, type NoiseTextureResult } from './noiseTexture';
import { createRenderWorkerClient } from './workerClient';

const runNoiseTextureWorker = createRenderWorkerClient<NoiseTextureRequest, NoiseTextureResult>({
  createWorker: () => new Worker(new URL('./noiseTexture.worker.ts', import.meta.url), { type: 'module' }),
  runFallback: generateNoiseTextureData,
});

export async function renderNoiseTexture(request: NoiseTextureRequest): Promise<NoiseTextureResult> {
  return runNoiseTextureWorker(request);
}
