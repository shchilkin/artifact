import type { EmojiLayer, FillLayer, ImageLayer, TextLayer } from '../../../types/config';
import { getCanvasFontStack } from '../../fontLoading';
import { REF, toCompositeOperation } from '../canvas';

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function fillStyle(ctx: CanvasRenderingContext2D, W: number, H: number, layer: FillLayer): string | CanvasGradient {
  if (layer.fillMode === 'linear') {
    const radians = (layer.angle * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    // Half the canvas extent along the gradient direction, so both ends touch the frame.
    const half = Math.abs(dx) * (W / 2) + Math.abs(dy) * (H / 2);
    const gradient = ctx.createLinearGradient(
      W / 2 - dx * half,
      H / 2 - dy * half,
      W / 2 + dx * half,
      H / 2 + dy * half,
    );
    gradient.addColorStop(0, layer.color);
    gradient.addColorStop(1, layer.colorB);
    return gradient;
  }
  if (layer.fillMode === 'radial') {
    const gradient = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    gradient.addColorStop(0, layer.color);
    gradient.addColorStop(1, layer.colorB);
    return gradient;
  }
  return layer.color;
}

export function drawFillLayer(ctx: CanvasRenderingContext2D, W: number, H: number, layer: FillLayer) {
  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);
  ctx.fillStyle = fillStyle(ctx, W, H, layer);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawEmojiLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EmojiLayer,
  rng: () => number,
  scale: number,
) {
  if (!layer.emojis.length || layer.density <= 0) return;
  const cx = W / 2;
  const cy = H / 2;

  const items = Array.from({ length: layer.density }, () => {
    const x = rng() * W;
    const y = rng() * H;
    const size = (layer.minSz + rng() * (layer.maxSz - layer.minSz)) * scale;
    const rotation = (rng() - 0.5) * 1.2;
    const opacity = 0.6 + rng() * 0.4;
    const emoji = layer.emojis[Math.floor(rng() * layer.emojis.length)];
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    return { emoji, x, y, size, rotation, opacity, dist };
  }).sort((a, b) => b.dist - a.dist);

  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);

  for (const item of items) {
    const blurFactor = 0;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);
    ctx.font = `${item.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';

    if (blurFactor > 0.12) {
      const N = Math.max(1, Math.floor(blurFactor * 8));
      for (let s = N; s >= 0; s--) {
        const sc = 1 + (s / N) * blurFactor * 0.95;
        const alpha = item.opacity * (1 - s / (N + 1));
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.scale(sc, sc);
        ctx.fillText(item.emoji, 0, 0);
        ctx.restore();
      }
    } else {
      ctx.globalAlpha = item.opacity;
      ctx.fillText(item.emoji, 0, 0);
    }

    ctx.restore();
  }

  ctx.restore();
}

function hexWithAlpha(color: string, alpha: number): string {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Canvas letter spacing adds space after the last letter too; this shifts the line back to its alignment. */
function trackingOffset(align: TextLayer['align'], tracking: number): number {
  if (align === 'center') return tracking / 2;
  if (align === 'right') return tracking;
  return 0;
}

export function drawTextLayer(ctx: CanvasRenderingContext2D, W: number, H: number, layer: TextLayer, scale: number) {
  if (!layer.content.trim()) return;
  const fontSize = layer.size * scale;
  const fontStack = getCanvasFontStack(layer.font);
  const tracking = (layer.tracking ?? 0) * scale;
  const outline = Math.max(0, (layer.outlineWidth ?? 0) * scale);
  const shadowAlpha = Math.max(0, Math.min(1, (layer.shadowOpacity ?? 0) / 100));

  ctx.save();
  ctx.font = `${fontSize}px ${fontStack}`; // must be set before wrapText uses measureText
  if (tracking !== 0) ctx.letterSpacing = `${tracking}px`;
  const lines = layer.content.split('\n').flatMap((part) => wrapText(ctx, part.trim() || ' ', W * 0.92));

  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);
  ctx.globalAlpha = layer.opacity / 100;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align as CanvasTextAlign;
  ctx.textBaseline = 'middle';
  ctx.translate(W * layer.x, H * layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scaleX, layer.scaleY);

  const maxWidth = W * 0.92;
  const lineH = fontSize * ((layer.leading ?? 125) / 100);
  const x = trackingOffset(layer.align, tracking);
  if (shadowAlpha > 0) {
    // Canvas shadows are offset in screen space, so they fall the same way at any rotation, like a light source.
    ctx.shadowColor = hexWithAlpha(layer.shadowColor, shadowAlpha);
    ctx.shadowBlur = Math.max(0, layer.shadowBlur) * scale;
    ctx.shadowOffsetX = layer.shadowX * scale;
    ctx.shadowOffsetY = layer.shadowY * scale;
  }
  lines.forEach((line, i) => {
    const y = (i - (lines.length - 1) / 2) * lineH;
    if (outline > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = outline * 2;
      ctx.strokeStyle = layer.outlineColor;
      ctx.strokeText(line, x, y, maxWidth);
      // The shadow is cast once, by the outline.
      ctx.shadowColor = 'transparent';
    }
    ctx.fillText(line, x, y, maxWidth);
    if (outline > 0 && shadowAlpha > 0) ctx.shadowColor = hexWithAlpha(layer.shadowColor, shadowAlpha);
  });
  ctx.restore();
}

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: ImageLayer,
  img: HTMLImageElement | null,
) {
  if (!img || !img.naturalWidth) return;
  ctx.save();
  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);
  ctx.globalAlpha = layer.opacity / 100;

  const px = W * layer.x;
  const py = H * layer.y;
  const rad = (layer.rotation * Math.PI) / 180;
  const drawFittedImage = (scale: number) => {
    const sw = img.naturalWidth * scale * layer.scaleX;
    const sh = img.naturalHeight * scale * layer.scaleY;
    ctx.translate(px, py);
    ctx.rotate(rad);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  };

  if (layer.fit === 'cover') {
    drawFittedImage(Math.max(W / img.naturalWidth, H / img.naturalHeight));
  } else if (layer.fit === 'contain') {
    drawFittedImage(Math.min(W / img.naturalWidth, H / img.naturalHeight));
  } else if (layer.fit === 'tile') {
    const pat = ctx.createPattern(img, 'repeat');
    if (pat) {
      const tileW = img.naturalWidth * (W / REF) * layer.scaleX;
      const tileH = img.naturalHeight * (H / REF) * layer.scaleY;
      pat.setTransform(new DOMMatrix().scale(tileW / img.naturalWidth, tileH / img.naturalHeight));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // 'free' — position, scale, rotate freely
    const baseScale = W / REF;
    const sw = img.naturalWidth * baseScale * layer.scaleX;
    const sh = img.naturalHeight * baseScale * layer.scaleY;
    ctx.translate(px, py);
    ctx.rotate(rad);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  }

  ctx.restore();
}
