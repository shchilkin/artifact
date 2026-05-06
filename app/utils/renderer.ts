import type { GeneratorConfig } from '../types/config';
import { lcg } from './lcg';

const REF = 540;

type RNG = () => number;

const FONT_MAP: Record<string, string> = {
  MONO:    '"Courier New", monospace',
  DISPLAY: '"Barlow Condensed", "Arial Black", sans-serif',
  VT323:   '"VT323", monospace',
  SPECIAL: '"Special Elite", "Courier New", monospace',
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
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
  return lines;
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig) {
  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const r = Math.sqrt(cx * cx + cy * cy);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(65,0,90,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawBgImage(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cfg: GeneratorConfig,
  bgImage: HTMLImageElement | null,
) {
  if (!bgImage || !bgImage.naturalWidth) return;
  ctx.save();
  ctx.globalCompositeOperation = cfg.bgImageBlend as GlobalCompositeOperation;
  ctx.globalAlpha = cfg.bgImageOpacity / 100;
  if (cfg.bgImageFit === 'cover') {
    const s = Math.max(W / bgImage.naturalWidth, H / bgImage.naturalHeight);
    const sw = bgImage.naturalWidth * s;
    const sh = bgImage.naturalHeight * s;
    ctx.drawImage(bgImage, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } else if (cfg.bgImageFit === 'contain') {
    const s = Math.min(W / bgImage.naturalWidth, H / bgImage.naturalHeight);
    const sw = bgImage.naturalWidth * s;
    const sh = bgImage.naturalHeight * s;
    ctx.drawImage(bgImage, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } else {
    const pat = ctx.createPattern(bgImage, 'repeat');
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
  }
  ctx.restore();
}

function drawRays(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig, rng: RNG) {
  const cx = W / 2;
  const cy = H / 2;
  const diagonal = Math.sqrt(W * W + H * H);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < cfg.rays; i++) {
    const baseAngle = (i / cfg.rays) * Math.PI * 2;
    const spread = (rng() - 0.5) * 0.6;
    const angle = baseAngle + spread;
    const width = (0.01 + rng() * 0.08) * diagonal;
    const alpha = (cfg.rayInt / 100) * (0.2 + rng() * 0.55);

    const ex = cx + Math.cos(angle) * diagonal;
    const ey = cy + Math.sin(angle) * diagonal;

    const grad = ctx.createLinearGradient(cx, cy, ex, ey);
    const hex = cfg.rayColor;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const perpAngle = angle + Math.PI / 2;
    const halfW = width / 2;
    ctx.lineTo(ex + Math.cos(perpAngle) * halfW, ey + Math.sin(perpAngle) * halfW);
    ctx.lineTo(ex - Math.cos(perpAngle) * halfW, ey - Math.sin(perpAngle) * halfW);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.restore();
}

function drawGlitch(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig, rng: RNG, scale: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < cfg.glitch; i++) {
    const y = rng() * H;
    const h = (1 + rng() * 3) * scale;
    const x = rng() * W * 0.3;
    const w = W * (0.3 + rng() * 0.7);
    const opacity = 0.12 + rng() * 0.25;

    if (i % 2 === 0) {
      ctx.fillStyle = `rgba(0,210,255,${opacity})`;
    } else {
      ctx.fillStyle = `rgba(255,0,200,${opacity})`;
    }
    ctx.fillRect(x, y, w, h);
  }

  ctx.restore();
}

function drawEmojis(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig, rng: RNG, scale: number) {
  if (cfg.emojis.length === 0) return;

  const cx = W / 2;
  const cy = H / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  interface EmojiItem {
    emoji: string;
    x: number;
    y: number;
    size: number;
    rotation: number;
    opacity: number;
    dist: number;
  }

  const items: EmojiItem[] = [];
  for (let i = 0; i < cfg.density; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const size = (cfg.minSz + rng() * (cfg.maxSz - cfg.minSz)) * scale;
    const rotation = (rng() - 0.5) * 1.2;
    const opacity = 0.6 + rng() * 0.4;
    const emoji = cfg.emojis[Math.floor(rng() * cfg.emojis.length)];
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    items.push({ emoji, x, y, size, rotation, opacity, dist });
  }

  items.sort((a, b) => b.dist - a.dist);

  for (const item of items) {
    const blurFactor = Math.max(0, 1 - item.dist / maxDist) * (cfg.blur / 100);

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
}

function drawText(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cfg: GeneratorConfig,
  scale: number,
) {
  if (!cfg.text || cfg.text.trim() === '') return;
  const fontSize = cfg.textSize * scale;
  const fontStack = FONT_MAP[cfg.textFont] ?? FONT_MAP.MONO;
  ctx.save();
  ctx.globalCompositeOperation = cfg.textBlend as GlobalCompositeOperation;
  ctx.globalAlpha = cfg.textOpacity / 100;
  ctx.fillStyle = cfg.textColor;
  ctx.font = `${fontSize}px ${fontStack}`;
  ctx.textAlign = cfg.textAlign as CanvasTextAlign;
  ctx.textBaseline = 'middle';
  const px = W * cfg.textX;
  const py = H * cfg.textY;
  ctx.translate(px, py);
  ctx.rotate((cfg.textRotation * Math.PI) / 180);
  const maxWidth = W * 0.92;
  const lines = wrapText(ctx, cfg.text.trim(), maxWidth);
  const lineH = fontSize * 1.25;
  lines.forEach((line, i) => {
    const lineY = (i - (lines.length - 1) / 2) * lineH;
    ctx.fillText(line, 0, lineY, maxWidth);
  });
  ctx.restore();
}

function applyCA(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig, scale: number) {
  if (cfg.ca === 0) return;
  const ca = Math.round(cfg.ca * scale);
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const rSrcX = Math.min(W - 1, x + ca);
      const bSrcX = Math.max(0, x - ca);
      const ri = (y * W + rSrcX) * 4;
      const bi = (y * W + bSrcX) * 4;
      data[i] = copy[ri];
      data[i + 2] = copy[bi + 2];
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawScanlines(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig, scale: number) {
  if (cfg.scanlines === 0) return;
  const step = Math.max(2, Math.round(2 * scale));
  const lineH = Math.max(1, Math.round(scale));
  ctx.fillStyle = `rgba(0,0,0,${cfg.scanlines / 100})`;
  for (let y = 0; y < H; y += step) {
    ctx.fillRect(0, y, W, lineH);
  }
}

function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig, seed: number) {
  if (cfg.grain === 0) return;
  const rng = lcg(seed * 3331);
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  const octx = offscreen.getContext('2d')!;
  const imageData = octx.createImageData(W, H);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * cfg.grain * 3;
    const v = 128 + noise;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = Math.min(255, Math.abs(noise) * 2);
  }

  octx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}

function drawTint(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: GeneratorConfig) {
  if (cfg.tintOp === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = cfg.tintOp / 100;
  ctx.fillStyle = cfg.tint;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cfg: GeneratorConfig,
  seed: number,
  scaleMultiplier = 1,
  bgImage: HTMLImageElement | null = null,
) {
  const scale = (W / REF) * scaleMultiplier;

  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  drawBackground(ctx, W, H, cfg);
  drawBgImage(ctx, W, H, cfg, bgImage);
  drawRays(ctx, W, H, cfg, lcg(seed ^ 0x1a2b3c));
  drawGlitch(ctx, W, H, cfg, lcg(seed ^ 0x4d5e6f), scale);
  drawEmojis(ctx, W, H, cfg, lcg(seed ^ 0x7a8b9c), scale);
  drawText(ctx, W, H, cfg, scale);
  applyCA(ctx, W, H, cfg, scale);
  drawScanlines(ctx, W, H, cfg, scale);
  drawGrain(ctx, W, H, cfg, seed);
  drawTint(ctx, W, H, cfg);
}
