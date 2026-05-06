import type { CanvasDocument } from '../types/config';
import { renderDocument } from './renderer';

const BADGE_ASPECT = 1 / 1.6;

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
    const borderW = bw * 0.025;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = borderW;
    ctx.strokeRect(px + borderW / 2, py + borderW / 2, bw - borderW, bh - borderW);
    ctx.restore();
  }
}

function triggerDownload(dataUrl: string, seed: number, resolution: number, format: 'png' | 'jpeg') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `cover-${seed}-${resolution}.${format}`;
  a.click();
}

export async function exportCanvas(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  resolution: 1500 | 2000 | 3000,
  format: 'png' | 'jpeg' = 'png',
): Promise<void> {
  const W = resolution;
  const H = resolution;
  const finalCanvas = await renderDocument(doc, W, H, imageCache);

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? 0.92 : 1.0;
  triggerDownload(finalCanvas.toDataURL(mimeType, quality), doc.global.seed, resolution, format);
}
