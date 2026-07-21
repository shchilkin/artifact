import { drawDocumentBackground } from '@shchilkin/artifact-runtime/rendering';

export const REF = 540;

function canvasDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

export function isDrawableCanvas(canvas: HTMLCanvasElement): boolean {
  return canvas.width > 0 && canvas.height > 0;
}

export function createCanvas(W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvasDimension(W);
  canvas.height = canvasDimension(H);
  return canvas;
}

export function cloneCanvas(source: HTMLCanvasElement, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  if (isDrawableCanvas(source)) ctx.drawImage(source, 0, 0);
  return canvas;
}

export function maskCanvasToAlpha(
  target: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  W: number,
  H: number,
): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (isDrawableCanvas(target)) ctx.drawImage(target, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  if (isDrawableCanvas(mask)) ctx.drawImage(mask, 0, 0);
  return canvas;
}

export function toCompositeOperation(blendMode: string): GlobalCompositeOperation {
  return (blendMode === 'normal' ? 'source-over' : blendMode) as GlobalCompositeOperation;
}

export function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string) {
  drawDocumentBackground(ctx, W, H, bg);
}
