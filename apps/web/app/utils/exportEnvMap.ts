import type { CanvasDocument } from '../types/config';
import { renderDocument } from './renderer';

const W = 4096;
const H = 2048;

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export returned an empty image blob'));
    }, 'image/png');
  });
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Renders and downloads the equirectangular env map; resolves with the downloaded file name. */
export async function exportEnvMap(doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>): Promise<string> {
  try {
    const finalCanvas = await renderDocument(doc, W, H, imageCache);
    const fileName = `envmap-${doc.global.seed}.png`;
    triggerBlobDownload(await canvasToPngBlob(finalCanvas), fileName);
    return fileName;
  } catch (err) {
    throw new Error(`Env map export failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}
