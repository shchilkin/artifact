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
    const finalCanvas = await renderCoverExportCanvas(doc, imageCache, scale, options);
    const W = finalCanvas.width;
    const H = finalCanvas.height;

    const { mimeType, quality } = exportFormatOptions(format);
    const blob = await canvasToBlob(finalCanvas, mimeType, quality);
    triggerDownload(blob, doc.global.seed, W, H, format);
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
