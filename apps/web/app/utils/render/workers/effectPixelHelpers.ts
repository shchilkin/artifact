export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function hexByte(hex: string, start: number) {
  const parsed = Number.parseInt(hex.slice(start, start + 2), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

export function copyPixel(out: Uint8ClampedArray, outIndex: number, data: Uint8ClampedArray, sourceIndex: number) {
  out[outIndex] = data[sourceIndex];
  out[outIndex + 1] = data[sourceIndex + 1];
  out[outIndex + 2] = data[sourceIndex + 2];
  out[outIndex + 3] = data[sourceIndex + 3];
}

export function remapPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sourcePoint: (x: number, y: number) => { x: number; y: number },
) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = sourcePoint(x, y);
      copyPixel(out, pixelIndex(width, x, y), data, pixelIndex(width, source.x, source.y));
    }
  }
  return out;
}

export function polarOffset(x: number, y: number, cx: number, cy: number) {
  const dx = x - cx;
  const dy = y - cy;
  return { dx, dy, dist: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) };
}

export function nearestPaletteColor(
  r: number,
  g: number,
  b: number,
  palette: Array<[number, number, number]>,
): [number, number, number] {
  let best = palette[0] ?? [0, 0, 0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const lumDelta = 0.299 * dr + 0.587 * dg + 0.114 * db;
    const distance = dr * dr * 0.7 + dg * dg + db * db * 0.8 + lumDelta * lumDelta * 0.6;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}
