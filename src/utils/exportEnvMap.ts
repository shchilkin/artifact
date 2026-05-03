import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

const W = 4096;
const H = 2048;

/**
 * Elements that look right on the flat 2D preview appear ~4× larger
 * when viewed through a typical 3D camera FOV on a sphere. This factor
 * scales emojis, glitch streaks, scanlines and CA shifts down during
 * the env map render pass only. Tune here without touching other logic.
 */
export const ENV_EXPORT_SCALE_FACTOR = 4;

function triggerBlobDownload(canvas: HTMLCanvasElement, seed: number) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `envmap-${seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, 'image/png');
}

export async function exportEnvMap(cfg: GeneratorConfig, seed: number): Promise<void> {
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  await new Promise<void>((r) =>
    setTimeout(() => {
      render(offscreen.getContext('2d', { willReadFrequently: true })!, W, H, cfg, seed, 1 / ENV_EXPORT_SCALE_FACTOR);
      r();
    }, 0)
  );

  // Use H as refSize so pixelate block density scales to the 2048 dimension
  const filters = buildFilters(cfg, seed, H);

  if (!filters) {
    triggerBlobDownload(offscreen, seed);
    return;
  }

  const out = await gpuRenderToCanvas({ width: W, height: H, source: offscreen, filters });
  triggerBlobDownload(out, seed);
}
