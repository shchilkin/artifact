import type { CanvasDocument } from '../types/config';
import { ASPECT_SIZES } from '../types/config';
import { type RenderOptions, renderDocument } from './renderer';

function triggerDownload(dataUrl: string, seed: number, w: number, h: number, format: 'png' | 'jpeg') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `cover-${seed}-${w}x${h}.${format}`;
  a.click();
}

export async function exportCanvas(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  scale: 1 | 2 | 3,
  format: 'png' | 'jpeg' = 'png',
  options: RenderOptions = {},
): Promise<void> {
  try {
    const [bw, bh] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
    const W = bw * scale;
    const H = bh * scale;
    const finalCanvas = await renderDocument(doc, W, H, imageCache, {
      ...options,
      effectResolution: { width: bw, height: bh },
    });

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.92 : 1.0;
    triggerDownload(finalCanvas.toDataURL(mimeType, quality), doc.global.seed, W, H, format);
  } catch (err) {
    throw new Error(`Canvas export failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}
