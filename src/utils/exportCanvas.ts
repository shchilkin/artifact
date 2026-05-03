import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

function triggerDownload(dataUrl: string, seed: number, resolution: number) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `cover-${seed}-${resolution}.png`;
  a.click();
}

export async function exportCanvas(
  cfg: GeneratorConfig,
  seed: number,
  resolution: 1500 | 2000 | 3000,
): Promise<void> {
  const W = resolution;
  const H = resolution;

  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  await new Promise<void>((r) => setTimeout(() => {
    render(offscreen.getContext('2d', { willReadFrequently: true })!, W, H, cfg, seed);
    r();
  }, 0));

  const filters = buildFilters(cfg, seed);

  if (!filters) {
    triggerDownload(offscreen.toDataURL('image/png', 1.0), seed, resolution);
    return;
  }

  const out = await gpuRenderToCanvas({ width: W, height: H, source: offscreen, filters });
  triggerDownload(out.toDataURL('image/png', 1.0), seed, resolution);
}
