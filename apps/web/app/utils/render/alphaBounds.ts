export interface AlphaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function measureAlphaBounds(canvas: HTMLCanvasElement, threshold = 8): AlphaBounds | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    return measureAlphaPixels(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
      threshold,
    );
  } catch {
    return null;
  }
}

export function measureVisibleAlphaBounds(canvas: HTMLCanvasElement): AlphaBounds | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return measureAlphaPixels(pixels, canvas.width, canvas.height, visibleAlphaThreshold(pixels));
  } catch {
    return null;
  }
}

export function visibleAlphaThreshold(pixels: Uint8ClampedArray) {
  let maxAlpha = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > maxAlpha) maxAlpha = pixels[i];
  }
  return Math.min(24, Math.max(8, maxAlpha * 0.08));
}

export function alphaBoundsCenter(bounds: AlphaBounds) {
  return {
    x: (bounds.minX + bounds.maxX + 1) / 2,
    y: (bounds.minY + bounds.maxY + 1) / 2,
  };
}

function measureAlphaPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): AlphaBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
