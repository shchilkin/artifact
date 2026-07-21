export interface TextureEffectLayer {
  glitch?: number;
  grain?: number;
  scanlines?: number;
  scanlineWidth?: number;
}

interface DrawableLayer {
  blendMode?: string;
  opacity?: number;
}

interface FillLayerLike extends DrawableLayer {
  color?: string;
}

interface EmojiLayerLike extends DrawableLayer {
  density?: number;
  emojis?: string[];
  maxSz?: number;
  minSz?: number;
  runtimeEmojiDrift?: number;
  runtimeEmojiPhase?: number;
}

interface TextLayerLike extends DrawableLayer {
  align?: string;
  color?: string;
  content?: string;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  size?: number;
  x?: number;
  y?: number;
}

interface ImageLayerLike extends DrawableLayer {
  fit?: string;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  x?: number;
  y?: number;
}

const REFERENCE_SIZE = 540;

export function loadRuntimeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    if (!src.startsWith('data:') && !src.startsWith('blob:')) image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Artifact Runtime could not load image ${src}.`)), {
      once: true,
    });
    image.src = src;
  });
}

export function drawDocumentBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: string,
) {
  if (background === 'transparent') {
    context.clearRect(0, 0, width, height);
    return;
  }
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.sqrt(centerX * centerX + centerY * centerY);
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(65,0,90,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.65)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function compositeOperation(blendMode: string | undefined): GlobalCompositeOperation {
  return (blendMode && blendMode !== 'normal' ? blendMode : 'source-over') as GlobalCompositeOperation;
}

function opacityValue(opacity: number | undefined): number {
  return (opacity ?? 100) / 100;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (context.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export function drawFillLayer(context: CanvasRenderingContext2D, width: number, height: number, layer: FillLayerLike) {
  context.save();
  context.globalAlpha = opacityValue(layer.opacity);
  context.globalCompositeOperation = compositeOperation(layer.blendMode);
  context.fillStyle = layer.color ?? '#000000';
  context.fillRect(0, 0, width, height);
  context.restore();
}

export function drawEmojiLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: EmojiLayerLike,
  rng: () => number,
  scale: number,
) {
  const emojis = layer.emojis ?? [];
  const density = layer.density ?? 0;
  if (emojis.length === 0 || density <= 0) return;
  const centerX = width / 2;
  const centerY = height / 2;
  const minSize = layer.minSz ?? 44;
  const maxSize = layer.maxSz ?? 106;
  const phase = (layer.runtimeEmojiPhase ?? 0) * Math.PI * 2;
  const drift = layer.runtimeEmojiDrift ?? 0;
  const items = Array.from({ length: density }, () => {
    const x = rng() * width;
    const y = rng() * height;
    const size = (minSize + rng() * (maxSize - minSize)) * scale;
    const rotation = (rng() - 0.5) * 1.2;
    const opacity = 0.6 + rng() * 0.4;
    const emoji = emojis[Math.floor(rng() * emojis.length)];
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    return { distance, emoji, opacity, rotation, size, x, y };
  }).sort((a, b) => b.distance - a.distance);

  context.save();
  context.globalAlpha = opacityValue(layer.opacity);
  context.globalCompositeOperation = compositeOperation(layer.blendMode);
  for (const item of items) {
    let x = item.x;
    let y = item.y;
    let rotation = item.rotation;
    if (phase !== 0 || drift !== 0) {
      const relativeX = item.x - centerX;
      const relativeY = item.y - centerY;
      const phaseCos = Math.cos(phase);
      const phaseSin = Math.sin(phase);
      const driftAngle = (item.x / Math.max(1, width) + item.y / Math.max(1, height) + item.size / 997) * Math.PI * 2;
      x = centerX + relativeX * phaseCos - relativeY * phaseSin + Math.cos(driftAngle + phase) * drift * width;
      y = centerY + relativeX * phaseSin + relativeY * phaseCos + Math.sin(driftAngle + phase) * drift * height;
      rotation += phase * 0.08;
    }
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.font = `${item.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'white';
    context.globalAlpha = item.opacity;
    context.fillText(item.emoji, 0, 0);
    context.restore();
  }
  context.restore();
}

export function drawTextLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: TextLayerLike,
  scale: number,
  fontStack: string,
) {
  const content = layer.content ?? '';
  if (!content.trim()) return;
  const fontSize = (layer.size ?? 64) * scale;
  context.save();
  context.font = `${fontSize}px ${fontStack}`;
  const lines = content.split('\n').flatMap((part) => wrapText(context, part.trim() || ' ', width * 0.92));
  context.globalCompositeOperation = compositeOperation(layer.blendMode);
  context.globalAlpha = opacityValue(layer.opacity);
  context.fillStyle = layer.color ?? '#ffffff';
  context.textAlign = (layer.align ?? 'center') as CanvasTextAlign;
  context.textBaseline = 'middle';
  context.translate(width * (layer.x ?? 0.5), height * (layer.y ?? 0.5));
  context.rotate(((layer.rotation ?? 0) * Math.PI) / 180);
  context.scale(layer.scaleX ?? 1, layer.scaleY ?? 1);
  const maxWidth = width * 0.92;
  const lineHeight = fontSize * 1.25;
  lines.forEach((line, index) => {
    context.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight, maxWidth);
  });
  context.restore();
}

export function drawImageLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: ImageLayerLike,
  image: HTMLImageElement | null,
) {
  if (!image?.naturalWidth) return;
  context.save();
  context.globalCompositeOperation = compositeOperation(layer.blendMode);
  context.globalAlpha = opacityValue(layer.opacity);
  const x = width * (layer.x ?? 0.5);
  const y = height * (layer.y ?? 0.5);
  const rotation = ((layer.rotation ?? 0) * Math.PI) / 180;
  const scaleX = layer.scaleX ?? 1;
  const scaleY = layer.scaleY ?? 1;
  const drawFittedImage = (scale: number) => {
    const drawWidth = image.naturalWidth * scale * scaleX;
    const drawHeight = image.naturalHeight * scale * scaleY;
    context.translate(x, y);
    context.rotate(rotation);
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  };

  if (layer.fit === 'cover') {
    drawFittedImage(Math.max(width / image.naturalWidth, height / image.naturalHeight));
  } else if (layer.fit === 'contain') {
    drawFittedImage(Math.min(width / image.naturalWidth, height / image.naturalHeight));
  } else if (layer.fit === 'tile') {
    const pattern = context.createPattern(image, 'repeat');
    if (pattern) {
      const tileWidth = image.naturalWidth * (width / REFERENCE_SIZE) * scaleX;
      const tileHeight = image.naturalHeight * (height / REFERENCE_SIZE) * scaleY;
      pattern.setTransform(new DOMMatrix().scale(tileWidth / image.naturalWidth, tileHeight / image.naturalHeight));
      context.fillStyle = pattern;
      context.fillRect(0, 0, width, height);
    }
  } else {
    const baseScale = width / REFERENCE_SIZE;
    const drawWidth = image.naturalWidth * baseScale * scaleX;
    const drawHeight = image.naturalHeight * baseScale * scaleY;
    context.translate(x, y);
    context.rotate(rotation);
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  }
  context.restore();
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
