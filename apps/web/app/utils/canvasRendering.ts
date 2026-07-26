export function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized.length === 3 ? normalized.replace(/(.)/g, '$1$1') : normalized, 16);
  const [red, green, blue] = Number.isFinite(value)
    ? [(value >> 16) & 255, (value >> 8) & 255, value & 255]
    : [255, 90, 54];
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function canvasHasVisibleContent(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    const channel = Math.max(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
    if (alpha > 8 && channel > 16) return true;
  }
  return false;
}

export function createSizedCanvas(size: number | { width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(typeof size === 'number' ? size : size.width));
  canvas.height = Math.max(1, Math.round(typeof size === 'number' ? size : size.height));
  return canvas;
}
