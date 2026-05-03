import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';

const BADGE_ASPECT = 104 / 340;

function drawParentalAdvisory(
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

  ctx.save();

  // Outer black border
  ctx.fillStyle = '#000000';
  ctx.fillRect(px, py, bw, bh);

  // White inner fill
  const b = bw * (3 / 340);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px + b, py + b, bw - b * 2, bh - b * 2);

  // Inner black border stroke
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = bw * (2 / 340);
  ctx.strokeRect(px + b, py + b, bw - b * 2, bh - b * 2);

  // Divider line
  const divY = py + bh * (54 / 104);
  ctx.beginPath();
  ctx.moveTo(px + b, divY);
  ctx.lineTo(px + bw - b, divY);
  ctx.stroke();

  // Text
  const fontSize = bw * (22 / 340);
  ctx.fillStyle = '#000000';
  ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = `${bw * (1 / 340)}px`;

  ctx.fillText('PARENTAL ADVISORY', px + bw / 2, py + bh * (43 / 104));
  ctx.fillText('EXPLICIT CONTENT', px + bw / 2, py + bh * (88 / 104));

  ctx.restore();
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
    drawParentalAdvisory(ctx, W, cfg.advisoryX, cfg.advisoryY, 0.3);
  }

  triggerDownload(finalCanvas.toDataURL('image/png', 1.0), seed, resolution);
}
