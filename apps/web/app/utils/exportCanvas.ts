import type { CanvasDocument } from '../types/config';
import { ASPECT_SIZES } from '../types/config';
import { canvasToBlob, downloadBlob } from './downloadBlob';
import { type RenderOptions, renderDocument } from './renderer';

/** Renders and downloads the cover; resolves with the downloaded file name. */
export async function exportCanvas(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  scale: 1 | 2 | 3,
  format: 'png' | 'jpeg' = 'png',
  options: RenderOptions = {},
): Promise<string> {
  try {
    const finalCanvas = await renderCoverExportCanvas(doc, imageCache, scale, options);
    const W = finalCanvas.width;
    const H = finalCanvas.height;

    const { mimeType, quality } = exportFormatOptions(format);
    const blob = await canvasToBlob(finalCanvas, mimeType, quality);
    const fileName = `cover-${doc.global.seed}-${W}x${H}.${format}`;
    downloadBlob(blob, fileName);
    return fileName;
  } catch (err) {
    throw new Error(`Canvas export failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

export async function renderCoverExportCanvas(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  scale: 1 | 2 | 3,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  const [baseWidth, baseHeight] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
  const baseCanvas = await renderDocument(doc, baseWidth, baseHeight, imageCache, {
    ...options,
    effectResolution: { width: baseWidth, height: baseHeight },
  });

  return upscaleCanvas(baseCanvas, baseWidth * scale, baseHeight * scale);
}

function upscaleCanvas(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source;

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return target;
}

function exportFormatOptions(format: 'png' | 'jpeg') {
  return format === 'jpeg' ? { mimeType: 'image/jpeg', quality: 0.92 } : { mimeType: 'image/png', quality: 1.0 };
}
