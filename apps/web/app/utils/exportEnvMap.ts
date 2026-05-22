import type { CanvasDocument } from '../types/config';
import { renderDocument } from './renderer';

const W = 4096;
const H = 2048;

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

export async function exportEnvMap(doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>): Promise<void> {
  try {
    const finalCanvas = await renderDocument(doc, W, H, imageCache);
    triggerBlobDownload(finalCanvas, doc.global.seed);
  } catch (err) {
    throw new Error(`Env map export failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}
