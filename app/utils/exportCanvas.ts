import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

/** Badge aspect ratio: viewBox 500 × 330 */
const BADGE_ASPECT = 330 / 500;

/** Minimal SVG string matching the inline badge recreation */
const PA_SVG = `<svg viewBox="0 0 500 330" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="330" fill="black"/>
  <rect x="9" y="9" width="482" height="312" fill="white"/>
  <rect x="14" y="14" width="472" height="302" fill="none" stroke="black" stroke-width="3"/>
  <rect x="14" y="14" width="472" height="56" fill="black"/>
  <rect x="14" y="260" width="472" height="56" fill="black"/>
  <text x="250" y="42" text-anchor="middle" dominant-baseline="middle" font-family="Impact,'Arial Narrow',Arial,sans-serif" font-size="36" fill="white" letter-spacing="8">PARENTAL</text>
  <text x="250" y="165" text-anchor="middle" dominant-baseline="central" font-family="Impact,'Arial Narrow',Arial,sans-serif" font-size="155" fill="black" textLength="458" lengthAdjust="spacingAndGlyphs">ADVISORY</text>
  <text x="250" y="288" text-anchor="middle" dominant-baseline="middle" font-family="Impact,'Arial Narrow',Arial,sans-serif" font-size="28" fill="white" letter-spacing="5">EXPLICIT CONTENT</text>
</svg>`;

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

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PA_SVG);
  const img = await loadImage(url);
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
