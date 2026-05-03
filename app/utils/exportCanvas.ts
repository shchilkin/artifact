import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

/** Badge aspect ratio from public/Parental_Advisory_label.svg: 265 × 166 */
const BADGE_ASPECT = 166 / 265;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawParentalAdvisory(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  x: number,
  y: number,
  size: number,
) {
  const bw = canvasSize * size;
  const bh = bw * BADGE_ASPECT;
  const px = canvasSize * x;
  const py = canvasSize * y;

  const img = await loadImage('/Parental_Advisory_label.svg');
  ctx.drawImage(img, px, py, bw, bh);
}

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
  let finalCanvas: HTMLCanvasElement;

  if (!filters) {
    finalCanvas = offscreen;
  } else {
    finalCanvas = await gpuRenderToCanvas({ width: W, height: H, source: offscreen, filters });
  }

  if (cfg.parentalAdvisory) {
    const ctx = finalCanvas.getContext('2d')!;
    await drawParentalAdvisory(ctx, W, cfg.advisoryX, cfg.advisoryY, 0.3);
  }

  triggerDownload(finalCanvas.toDataURL('image/png', 1.0), seed, resolution);
}
