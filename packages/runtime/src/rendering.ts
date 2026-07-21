export interface TextureEffectLayer {
  glitch?: number;
  grain?: number;
  scanlines?: number;
  scanlineWidth?: number;
}

function pixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function glitchFillStyle(index: number, opacity: number): string {
  return index % 2 === 0 ? `rgba(0,210,255,${opacity})` : `rgba(255,0,200,${opacity})`;
}

export function lcg(seed: number) {
  let state = (seed ^ 0x12345678) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function applyScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: TextureEffectLayer,
  scale: number,
) {
  const amount = layer.scanlines ?? 0;
  if (amount <= 0) return;

  const lineHeight = Math.max(1, Math.round((layer.scanlineWidth ?? 1) * scale));
  const gap = Math.max(1, Math.round(scale));
  const step = lineHeight + gap;
  ctx.fillStyle = `rgba(0,0,0,${amount / 100})`;
  for (let y = 0; y < height; y += step) ctx.fillRect(0, y, width, lineHeight);
}

export function applyGlitchEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: TextureEffectLayer,
  scale: number,
  rng: () => number,
) {
  const amount = layer.glitch ?? 0;
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let index = 0; index < amount; index += 1) {
    const y = rng() * height;
    const lineHeight = (1 + rng() * 3) * scale;
    const x = rng() * width * 0.3;
    const lineWidth = width * (0.3 + rng() * 0.7);
    const opacity = 0.12 + rng() * 0.25;
    ctx.fillStyle = glitchFillStyle(index, opacity);
    ctx.fillRect(x, y, lineWidth, lineHeight);
  }
  ctx.restore();
}

export function applyChromaticAberration(data: Uint8ClampedArray, width: number, height: number, amountValue: number) {
  if (amountValue <= 0) return;
  const amount = Math.round(amountValue);
  const centerX = width / 2;
  const centerY = height / 2;
  const copy = new Uint8ClampedArray(data);
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = pixelIndex(width, x, y);
      const deltaX = (x - centerX) / maxDistance;
      const deltaY = (y - centerY) / maxDistance;
      const redX = Math.min(width - 1, Math.max(0, Math.round(x + deltaX * amount)));
      const redY = Math.min(height - 1, Math.max(0, Math.round(y + deltaY * amount)));
      const blueX = Math.min(width - 1, Math.max(0, Math.round(x - deltaX * amount)));
      const blueY = Math.min(height - 1, Math.max(0, Math.round(y - deltaY * amount)));
      data[index] = copy[pixelIndex(width, redX, redY)];
      data[index + 2] = copy[pixelIndex(width, blueX, blueY) + 2];
    }
  }
}

export function applyGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: TextureEffectLayer,
  seed: number,
) {
  const amount = layer.grain ?? 0;
  if (amount <= 0) return;

  const grainRng = lcg(seed * 3331);
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offscreenContext = offscreen.getContext('2d');
  if (!offscreenContext) throw new Error('Artifact Runtime could not create a grain canvas.');
  const imageData = offscreenContext.createImageData(width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const noise = (grainRng() - 0.5) * amount * 3;
    const value = 128 + noise;
    data[index] = data[index + 1] = data[index + 2] = value;
    data[index + 3] = Math.min(255, Math.abs(noise) * 2);
  }
  offscreenContext.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}
