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
  bordered: boolean,
) {
  const bw = canvasSize * size;
  const bh = bw * BADGE_ASPECT;
  const px = canvasSize * x;
  const py = canvasSize * y;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PA_SVG);
  const img = await loadImage(url);
  ctx.drawImage(img, px, py, bw, bh);

  if (bordered) {
    // Match CSS: box-shadow inset 0 0 0 2.5cqw #ffffff — white border drawn
    // inside the badge boundary, 2.5 % of badge width thick.
    const borderW = bw * 0.025;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = borderW;
    ctx.strokeRect(
      px + borderW / 2,
      py + borderW / 2,
      bw - borderW,
      bh - borderW,
    );
    ctx.restore();
  }
}

function triggerDownload(dataUrl: string, seed: number, resolution: number) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `cover-${seed}-${resolution}.png`;
  a.click();
}

/**
 * The 2D canvas is always rendered at PREVIEW_SIZE (540 px) — the same
 * resolution used by the live preview — so that emoji rendering, pixel-space
 * chromatic aberration, scanline alignment, and every other pixel-count-
 * sensitive operation produces identical output in both pipelines.
 *
 * The GPU blit inside gpuRenderToCanvas bilinearly scales the 540 px canvas
 * up to the target resolution before the GLSL filters run, so the filter
 * effects (halftone, warp, bloom, …) are still executed at full export
 * resolution.  Without filters the 540 px canvas is drawn onto a target-size
 * canvas via drawImage to keep the same behaviour.
 */
const PREVIEW_SIZE = 540;

export async function exportCanvas(
  cfg: GeneratorConfig,
  seed: number,
  resolution: 1500 | 2000 | 3000,
): Promise<void> {
  const W = resolution;
  const H = resolution;

  // Render 2D pipeline at preview resolution — keeps visual output identical
  // to the live preview regardless of export resolution.
  const offscreen = document.createElement('canvas');
  offscreen.width = PREVIEW_SIZE;
  offscreen.height = PREVIEW_SIZE;
  await new Promise<void>((r) => setTimeout(() => {
    render(offscreen.getContext('2d', { willReadFrequently: true })!, PREVIEW_SIZE, PREVIEW_SIZE, cfg, seed);
    r();
  }, 0));

  const filters = buildFilters(cfg, seed);
  let finalCanvas: HTMLCanvasElement;

  if (!filters) {
    // No GPU filters: scale up via 2D canvas drawImage.
    const scaled = document.createElement('canvas');
    scaled.width = W;
    scaled.height = H;
    scaled.getContext('2d')!.drawImage(offscreen, 0, 0, W, H);
    finalCanvas = scaled;
  } else {
    // GPU blit scales 540 px source → W px texture; filters run at full res.
    finalCanvas = await gpuRenderToCanvas({ width: W, height: H, source: offscreen, filters });
  }

  if (cfg.parentalAdvisory) {
    const ctx = finalCanvas.getContext('2d')!;
    await drawParentalAdvisory(ctx, W, cfg.advisoryX, cfg.advisoryY, 0.3, cfg.advisoryBorder);
  }

  triggerDownload(finalCanvas.toDataURL('image/png', 1.0), seed, resolution);
}
