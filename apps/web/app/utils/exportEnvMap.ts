import type { CanvasDocument } from '../types/config';
import { canvasToBlob, downloadBlob } from './downloadBlob';
import { renderDocument } from './renderer';

const W = 4096;
const H = 2048;

/** Renders and downloads the equirectangular env map; resolves with the downloaded file name. */
export async function exportEnvMap(doc: CanvasDocument, imageCache: Map<string, HTMLImageElement>): Promise<string> {
  try {
    const finalCanvas = await renderDocument(doc, W, H, imageCache);
    const fileName = `envmap-${doc.global.seed}.png`;
    downloadBlob(await canvasToBlob(finalCanvas, 'image/png'), fileName);
    return fileName;
  } catch (err) {
    throw new Error(`Env map export failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}
