import type { CanvasDocument } from '../types/config';
import { ASPECT_SIZES } from '../types/config';
import { type RenderOptions, renderDocument } from './renderer';

function triggerDownload(blob: Blob, seed: number, w: number, h: number, format: 'png' | 'jpeg') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cover-${seed}-${w}x${h}.${format}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

    const { mimeType, quality } = exportFormatOptions(format);
    const blob = await canvasToBlob(finalCanvas, mimeType, quality);
    triggerDownload(blob, doc.global.seed, W, H, format);
  } catch (err) {
    throw new Error(`Canvas export failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function exportFormatOptions(format: 'png' | 'jpeg') {
  return format === 'jpeg' ? { mimeType: 'image/jpeg', quality: 0.92 } : { mimeType: 'image/png', quality: 1.0 };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export returned an empty image blob'));
      },
      mimeType,
      quality,
    );
  });
}
