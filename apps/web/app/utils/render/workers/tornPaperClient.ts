/**
 * Runs the torn paper kernel in its own worker. The renderer loads this module only when a Torn Paper effect is on,
 * so the kernel stays out of the startup bundle and the shared effect worker.
 */
import { runTornPaper, type TornPaperRequest, type TornPaperResult } from './effectPixelTornPaper';
import { createRenderWorkerClient } from './workerClient';

const runTornPaperWorker = createRenderWorkerClient<TornPaperRequest, TornPaperResult>({
  createWorker: () => new Worker(new URL('./tornPaper.worker.ts', import.meta.url), { type: 'module' }),
  fallbackRequest: (request) => ({ ...request, data: new Uint8ClampedArray(request.data) }),
  runFallback: runTornPaper,
  transfer: (request) => [request.data.buffer],
});

export async function renderTornPaper(request: TornPaperRequest): Promise<TornPaperResult> {
  return runTornPaperWorker(request);
}
