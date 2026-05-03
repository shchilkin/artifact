import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

/** Badge aspect ratio: 1.6 : 1 (Width : Height) */
const BADGE_ASPECT = 1 / 1.6;

/**
 * SVG string replicating the HTML/CSS badge at viewBox 500 × 313.
 * Used as a data URL so export doesn't depend on the public folder.
 *
 * Frame:  3.4 % of 500 = 17 px → inner area 466 × 279
 * Border: 0.8 % of 500 =  4 px
 * Rows (of inner 279 px): top 26 % = 73 px | mid 48 % = 134 px | bot 26 % = 72 px
 */
const PA_SVG = `<svg viewBox="0 0 500 313" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="313" fill="#000"/>
  <rect x="17" y="17" width="466" height="279" fill="#fff"/>
  <rect x="17" y="17" width="466" height="279" fill="none" stroke="#000" stroke-width="4"/>
  <rect x="17" y="17" width="466" height="73"  fill="#000"/>
  <rect x="17" y="223" width="466" height="73" fill="#000"/>
  <text x="250" y="53"  text-anchor="middle" dominant-baseline="middle"
        font-family="Impact,'Arial Narrow',Arial,sans-serif"
        font-size="30" fill="#fff" letter-spacing="9.6">PARENTAL</text>
  <text x="250" y="156" text-anchor="middle" dominant-baseline="central"
        font-family="Impact,'Arial Narrow',Arial,sans-serif"
        font-size="105" fill="#000"
        textLength="458" lengthAdjust="spacingAndGlyphs">ADVISORY</text>
  <text x="250" y="259" text-anchor="middle" dominant-baseline="middle"
        font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
        font-weight="900" font-size="23" fill="#fff" letter-spacing="5">EXPLICIT CONTENT</text>
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
