import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

const THUMB_SIZE = 200;

/**
 * Renders the full pipeline (Canvas 2D + PixiJS GPU filters) at thumbnail
 * resolution so presets accurately reflect the actual cover appearance.
 */
export async function generateThumbnail(cfg: GeneratorConfig, seed: number): Promise<string> {
  const W = THUMB_SIZE;
  const H = THUMB_SIZE;

  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;

  await new Promise<void>((r) =>
    setTimeout(() => {
      render(offscreen.getContext('2d', { willReadFrequently: true })!, W, H, cfg, seed);
      r();
    }, 0)
  );

  const filters = buildFilters(cfg, seed);

  if (!filters) {
    return offscreen.toDataURL('image/jpeg', 0.8);
  }

  const out = await gpuRenderToCanvas({ width: W, height: H, source: offscreen, filters });
  return out.toDataURL('image/jpeg', 0.8);
}
