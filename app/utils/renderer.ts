import type {
  CanvasDocument,
  CanvasGraph,
  EffectLayer,
  EmojiLayer,
  FillLayer,
  GraphColorNode,
  GraphMergeNode,
  ImageLayer,
  Layer,
  TextLayer,
} from '../types/config';
import { lcg } from './lcg';
import { buildFiltersFromEffectLayer } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';
import { EXPORT_NODE_ID, inferLinearGraph } from './nodeGraph';
import type { Filter } from 'pixi.js';

const REF = 540;
const FONT_MAP: Record<string, string> = {
  MONO: '"Courier New", monospace',
  DISPLAY: '"Barlow Condensed", "Arial Black", sans-serif',
  VT323: '"VT323", monospace',
  SPECIAL: '"Special Elite", "Courier New", monospace',
};

function createCanvas(W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  return canvas;
}

function cloneCanvas(source: HTMLCanvasElement, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function maskCanvasToAlpha(
  target: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  W: number,
  H: number,
): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(target, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return canvas;
}

function toCompositeOperation(blendMode: string): GlobalCompositeOperation {
  return (blendMode === 'normal' ? 'source-over' : blendMode) as GlobalCompositeOperation;
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string) {
  if (bg === "transparent") {
    ctx.clearRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = bg;
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

function drawFillLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: FillLayer,
) {
  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);
  ctx.fillStyle = layer.color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawEmojiLayer(
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
  const maxDist = Math.sqrt(cx * cx + cy * cy);

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
    const blurFactor = Math.max(0, 1 - item.dist / maxDist) * (layer.blur / 100);
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

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: TextLayer,
  scale: number,
) {
  if (!layer.content.trim()) return;
  const fontSize = layer.size * scale;
  const fontStack = FONT_MAP[layer.font] ?? FONT_MAP.MONO;

  ctx.save();
  ctx.font = `${fontSize}px ${fontStack}`;  // must be set before wrapText uses measureText
  const lines = layer.content
    .split('\n')
    .flatMap((part) => wrapText(ctx, part.trim() || ' ', W * 0.92));

  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);
  ctx.globalAlpha = layer.opacity / 100;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align as CanvasTextAlign;
  ctx.textBaseline = 'middle';
  ctx.translate(W * layer.x, H * layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scaleX, layer.scaleY);

  const maxWidth = W * 0.92;
  const lineH = fontSize * 1.25;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineH, maxWidth);
  });
  ctx.restore();
}

function drawImageLayer(
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

  if (layer.fit === 'cover') {
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = img.naturalWidth * s * layer.scaleX;
    const sh = img.naturalHeight * s * layer.scaleY;
    ctx.translate(px, py);
    ctx.rotate(rad);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  } else if (layer.fit === 'contain') {
    const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const sw = img.naturalWidth * s * layer.scaleX;
    const sh = img.naturalHeight * s * layer.scaleY;
    ctx.translate(px, py);
    ctx.rotate(rad);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
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

function applyCanvas2DEffects(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  seed: number,
  scale: number,
  rng: () => number,
) {
  if (layer.rayInt > 0 && layer.rays > 0) {
    const cx = W / 2;
    const cy = H / 2;
    const diagonal = Math.sqrt(W * W + H * H);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < layer.rays; i++) {
      const baseAngle = (i / layer.rays) * Math.PI * 2;
      const spread = (rng() - 0.5) * 0.6;
      const angle = baseAngle + spread;
      const width = (0.01 + rng() * 0.08) * diagonal;
      const alpha = (layer.rayInt / 100) * (0.2 + rng() * 0.55);
      const ex = cx + Math.cos(angle) * diagonal;
      const ey = cy + Math.sin(angle) * diagonal;
      const r = parseInt(layer.rayColor.slice(1, 3), 16);
      const g = parseInt(layer.rayColor.slice(3, 5), 16);
      const b = parseInt(layer.rayColor.slice(5, 7), 16);
      const grad = ctx.createLinearGradient(cx, cy, ex, ey);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      const perpAngle = angle + Math.PI / 2;
      const halfW = width / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex + Math.cos(perpAngle) * halfW, ey + Math.sin(perpAngle) * halfW);
      ctx.lineTo(ex - Math.cos(perpAngle) * halfW, ey - Math.sin(perpAngle) * halfW);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  if (layer.glitch > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < layer.glitch; i++) {
      const y = rng() * H;
      const h = (1 + rng() * 3) * scale;
      const x = rng() * W * 0.3;
      const w = W * (0.3 + rng() * 0.7);
      const opacity = 0.12 + rng() * 0.25;
      ctx.fillStyle = i % 2 === 0 ? `rgba(0,210,255,${opacity})` : `rgba(255,0,200,${opacity})`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  if (layer.rgbSplit > 0) {
    const rgbSplit = Math.round(layer.rgbSplit * scale);
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const rx = Math.min(W - 1, x + rgbSplit);
        const ry = Math.min(H - 1, y + rgbSplit);
        const ri = (ry * W + rx) * 4;
        
        const bx = Math.max(0, x - rgbSplit);
        const by = Math.max(0, y - rgbSplit);
        const bi = (by * W + bx) * 4;
        
        data[i] = copy[ri];           // Red channel shifted down-right
        data[i + 2] = copy[bi + 2];   // Blue channel shifted up-left
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.scanlines > 0) {
    const step = Math.max(2, Math.round(2 * scale));
    const lineH = Math.max(1, Math.round(scale));
    ctx.fillStyle = `rgba(0,0,0,${layer.scanlines / 100})`;
    for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, lineH);
  }

  if (layer.grain > 0) {
    const grainRng = lcg(seed * 3331);
    const offscreen = createCanvas(W, H);
    const octx = offscreen.getContext('2d')!;
    const imageData = octx.createImageData(W, H);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (grainRng() - 0.5) * layer.grain * 3;
      const v = 128 + noise;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = Math.min(255, Math.abs(noise) * 2);
    }
    octx.putImageData(imageData, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();
  }

  if (layer.tintOp > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = layer.tintOp / 100;
    ctx.fillStyle = layer.tint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const needsPixelPass = layer.sepia > 0 || layer.infrared > 0 || layer.ca > 0 || layer.dither > 0;
  if (needsPixelPass) {
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;

    if (layer.sepia > 0 || layer.infrared > 0) {
      const sepiaT = layer.sepia / 100;
      const infraredT = layer.infrared / 100;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];

        if (sepiaT > 0) {
          const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
          const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
          const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
          r = Math.round(r + (sr - r) * sepiaT);
          g = Math.round(g + (sg - g) * sepiaT);
          b = Math.round(b + (sb - b) * sepiaT);
        }

        if (infraredT > 0) {
          const ir = r;
          const ig = g;
          const ib = b;
          r = Math.min(255, Math.round(ir + ig * infraredT * 0.8));
          g = Math.min(255, Math.round(ig * (1 - infraredT * 0.65)));
          b = Math.min(255, Math.round(ib * (1 - infraredT * 0.3) + infraredT * 22));
        }

        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
    }

    if (layer.ca > 0) {
      const amt = Math.round(layer.ca * scale);
      const cx = W / 2, cy = H / 2;
      const copy = new Uint8ClampedArray(d);
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const dx = (x - cx) / maxDist;
          const dy = (y - cy) / maxDist;
          const rx = Math.min(W - 1, Math.max(0, Math.round(x + dx * amt)));
          const ry = Math.min(H - 1, Math.max(0, Math.round(y + dy * amt)));
          const bx = Math.min(W - 1, Math.max(0, Math.round(x - dx * amt)));
          const by = Math.min(H - 1, Math.max(0, Math.round(y - dy * amt)));
          d[i] = copy[(ry * W + rx) * 4];
          d[i + 2] = copy[(by * W + bx) * 4 + 2];
        }
      }
    }

    if (layer.dither > 0) {
      const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
      const levels = Math.max(2, Math.round(16 - layer.dither * 0.14));
      const step = 255 / (levels - 1);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const bayer = BAYER[y & 3][x & 3] / 16;
          for (let c = 0; c < 3; c++) {
            d[i + c] = Math.min(255, Math.max(0, Math.round((d[i + c] / step + bayer)) * step));
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.vhsTracking > 0) {
    const srcData = ctx.getImageData(0, 0, W, H);
    const bands = Math.max(3, Math.floor(layer.vhsTracking * 0.25 + 3));
    const maxShift = Math.max(1, Math.floor(layer.vhsTracking * 0.08 * W / 100));
    const out = ctx.createImageData(W, H);
    const od = out.data;
    const sd = srcData.data;
    const bandH = Math.ceil(H / bands);
    for (let band = 0; band < bands; band++) {
      const shiftX = Math.floor((rng() - 0.5) * 2 * maxShift);
      const shiftR = Math.floor((rng() - 0.5) * maxShift * 0.5);
      const y0 = band * bandH;
      const y1 = Math.min(H, y0 + bandH);
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < W; x++) {
          const oi = (y * W + x) * 4;
          const sx = Math.min(W - 1, Math.max(0, x + shiftX));
          const si = (y * W + sx) * 4;
          const srx = Math.min(W - 1, Math.max(0, x + shiftX + shiftR));
          const sri = (y * W + srx) * 4;
          od[oi]     = sd[sri];
          od[oi + 1] = sd[si + 1];
          od[oi + 2] = sd[si + 2];
          od[oi + 3] = sd[si + 3];
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.matte > 0) {
    const matteRng = lcg(seed * 7177);
    const res = 48;
    const offscreen = createCanvas(res, res);
    const octx = offscreen.getContext('2d')!;
    const id = octx.createImageData(res, res);
    const md = id.data;
    for (let i = 0; i < md.length; i += 4) {
      const v = Math.floor(matteRng() * 255);
      md[i] = md[i + 1] = md[i + 2] = v;
      md[i + 3] = Math.floor(matteRng() * 180 + 40);
    }
    octx.putImageData(id, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = (layer.matte / 100) * 0.35;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(offscreen, 0, 0, W, H);
    ctx.restore();
  }

  if (layer.waveAmt > 0) {
    const maxShift = Math.round(layer.waveAmt * scale * 0.5);
    const freq = (layer.waveFreq * Math.PI * 2) / H;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data;
    const od = out.data;
    for (let y = 0; y < H; y++) {
      const shift = Math.round(Math.sin(y * freq) * maxShift);
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, x + shift));
        const oi = (y * W + x) * 4;
        const si = (y * W + sx) * 4;
        od[oi]     = sd[si];
        od[oi + 1] = sd[si + 1];
        od[oi + 2] = sd[si + 2];
        od[oi + 3] = sd[si + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.zoomBlur > 0) {
    const snapshot = createCanvas(W, H);
    const sctx = snapshot.getContext('2d')!;
    sctx.drawImage(ctx.canvas, 0, 0);
    const steps = 8;
    const maxScale = 1 + (layer.zoomBlur / 100) * 0.18;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const s = 1 + (maxScale - 1) * t;
      ctx.globalAlpha = 1 / steps;
      ctx.drawImage(snapshot, (1 - s) * W / 2, (1 - s) * H / 2, W * s, H * s);
    }
    ctx.restore();
  }

  if (layer.neonGlow > 0) {
    const r6 = parseInt(layer.neonColor.slice(1, 3), 16);
    const g6 = parseInt(layer.neonColor.slice(3, 5), 16);
    const b6 = parseInt(layer.neonColor.slice(5, 7), 16);
    const srcData = ctx.getImageData(0, 0, W, H);
    const sd = srcData.data;
    const bright = createCanvas(W, H);
    const bctx = bright.getContext('2d')!;
    const bid = bctx.createImageData(W, H);
    const bd = bid.data;
    for (let i = 0; i < sd.length; i += 4) {
      const lum = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      const t = Math.max(0, (lum - 120) / 135);
      bd[i]     = Math.round(r6 * t);
      bd[i + 1] = Math.round(g6 * t);
      bd[i + 2] = Math.round(b6 * t);
      bd[i + 3] = Math.round(255 * t);
    }
    bctx.putImageData(bid, 0, 0);
    const glow = createCanvas(W, H);
    const gctx = glow.getContext('2d')!;
    const blurPx = Math.round((layer.neonGlow / 100) * 18 * scale);
    gctx.filter = `blur(${blurPx}px)`;
    gctx.drawImage(bright, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, (layer.neonGlow / 100) * 1.4);
    ctx.drawImage(glow, 0, 0);
    ctx.restore();
  }

  if (layer.overprint > 0) {
    const shift = Math.round(layer.overprint * scale * 0.12);
    const srcData = ctx.getImageData(0, 0, W, H);
    const sd = srcData.data;

    function makePlate(shiftX: number, shiftY: number, pr: number, pg: number, pb: number): HTMLCanvasElement {
      const c = createCanvas(W, H);
      const pctx = c.getContext('2d')!;
      const pid = pctx.createImageData(W, H);
      const pd = pid.data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const oi = (y * W + x) * 4;
          const sx = Math.min(W - 1, Math.max(0, x + shiftX));
          const sy = Math.min(H - 1, Math.max(0, y + shiftY));
          const si = (sy * W + sx) * 4;
          const lum = 0.299 * sd[si] + 0.587 * sd[si + 1] + 0.114 * sd[si + 2];
          pd[oi]     = pr;
          pd[oi + 1] = pg;
          pd[oi + 2] = pb;
          pd[oi + 3] = Math.round(255 - lum);
        }
      }
      pctx.putImageData(pid, 0, 0);
      return c;
    }

    const cyan    = makePlate(shift, 0,      0,   255, 255);
    const magenta = makePlate(-shift, shift, 255,  0,  255);
    const yellow  = makePlate(0, -shift,    255, 255,   0);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = (layer.overprint / 100) * 0.7;
    ctx.drawImage(cyan, 0, 0);
    ctx.drawImage(magenta, 0, 0);
    ctx.drawImage(yellow, 0, 0);
    ctx.restore();
  }

  if (layer.solarize > 0) {
    const threshold = 255 * (1 - (layer.solarize / 100) * 0.85);
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum > threshold) {
        d[i]     = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.bleachBypass > 0) {
    const t = layer.bleachBypass / 100;
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const ov = (c: number) =>
        c < 128 ? (2 * c * lum / 255) : (255 - 2 * (255 - c) * (255 - lum) / 255);
      d[i]     = Math.min(255, Math.round(r + (ov(r) - r) * t));
      d[i + 1] = Math.min(255, Math.round(g + (ov(g) - g) * t));
      d[i + 2] = Math.min(255, Math.round(b + (ov(b) - b) * t));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.cyanotype > 0) {
    const t = layer.cyanotype / 100;
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      // Prussian blue [0,49,83] to ivory paper [235,240,230]
      const cr = Math.round(0   + (235 - 0)   * lum);
      const cg = Math.round(49  + (240 - 49)  * lum);
      const cb = Math.round(83  + (230 - 83)  * lum);
      d[i]     = Math.round(d[i]     + (cr - d[i])     * t);
      d[i + 1] = Math.round(d[i + 1] + (cg - d[i + 1]) * t);
      d[i + 2] = Math.round(d[i + 2] + (cb - d[i + 2]) * t);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.splitToneAmt > 0) {
    const t = layer.splitToneAmt / 100;
    const sR = parseInt(layer.splitShadow.slice(1, 3), 16);
    const sG = parseInt(layer.splitShadow.slice(3, 5), 16);
    const sB = parseInt(layer.splitShadow.slice(5, 7), 16);
    const hR = parseInt(layer.splitHighlight.slice(1, 3), 16);
    const hG = parseInt(layer.splitHighlight.slice(3, 5), 16);
    const hB = parseInt(layer.splitHighlight.slice(5, 7), 16);
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const sw = Math.max(0, (128 - lum) / 128);
      const hw = Math.max(0, (lum - 128) / 128);
      d[i]     = Math.min(255, Math.round(d[i]     + (sR - d[i])     * sw * t + (hR - d[i])     * hw * t));
      d[i + 1] = Math.min(255, Math.round(d[i + 1] + (sG - d[i + 1]) * sw * t + (hG - d[i + 1]) * hw * t));
      d[i + 2] = Math.min(255, Math.round(d[i + 2] + (sB - d[i + 2]) * sw * t + (hB - d[i + 2]) * hw * t));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.rippleAmt > 0) {
    const cx = W / 2, cy = H / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const maxShift = layer.rippleAmt * scale * 0.5;
    const freq = (layer.rippleFreq * Math.PI * 2) / maxDist;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data, od = out.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const shift = Math.sin(dist * freq) * maxShift;
        const nx = Math.min(W - 1, Math.max(0, Math.round(cx + (dist + shift) * Math.cos(angle))));
        const ny = Math.min(H - 1, Math.max(0, Math.round(cy + (dist + shift) * Math.sin(angle))));
        const oi = (y * W + x) * 4, si = (ny * W + nx) * 4;
        od[oi] = sd[si]; od[oi+1] = sd[si+1]; od[oi+2] = sd[si+2]; od[oi+3] = sd[si+3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.kaleidoscope > 0) {
    const segments = Math.max(3, Math.round(3 + (layer.kaleidoscope / 100) * 13));
    const sectorAngle = (Math.PI * 2) / segments;
    const cx = W / 2, cy = H / 2;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data, od = out.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;
        let a = angle % sectorAngle;
        if (a > sectorAngle / 2) a = sectorAngle - a;
        const nx = Math.min(W - 1, Math.max(0, Math.round(cx + dist * Math.cos(a))));
        const ny = Math.min(H - 1, Math.max(0, Math.round(cy + dist * Math.sin(a))));
        const oi = (y * W + x) * 4, si = (ny * W + nx) * 4;
        od[oi] = sd[si]; od[oi+1] = sd[si+1]; od[oi+2] = sd[si+2]; od[oi+3] = sd[si+3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.squeezeX !== 0 || layer.squeezeY !== 0) {
    const xFactor = Math.max(0.01, 1 + layer.squeezeX / 100);
    const yFactor = Math.max(0.01, 1 + layer.squeezeY / 100);
    const cx = W / 2, cy = H / 2;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data, od = out.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, Math.round(cx + (x - cx) / xFactor)));
        const sy = Math.min(H - 1, Math.max(0, Math.round(cy + (y - cy) / yFactor)));
        const oi = (y * W + x) * 4, si = (sy * W + sx) * 4;
        od[oi] = sd[si]; od[oi+1] = sd[si+1]; od[oi+2] = sd[si+2]; od[oi+3] = sd[si+3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.emboss > 0) {
    const srcData = ctx.getImageData(0, 0, W, H);
    const sd = srcData.data;
    const embossed = ctx.createImageData(W, H);
    const ed = embossed.data;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const tl = sd[((y - 1) * W + (x - 1)) * 4 + c];
          const br = sd[((y + 1) * W + (x + 1)) * 4 + c];
          ed[i + c] = Math.min(255, Math.max(0, Math.round(128 + (tl - br))));
        }
        ed[i + 3] = 255;
      }
    }
    const embossCanvas = createCanvas(W, H);
    embossCanvas.getContext('2d')!.putImageData(embossed, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = layer.emboss / 100;
    ctx.drawImage(embossCanvas, 0, 0);
    ctx.restore();
  }

  if (layer.linocut > 0) {
    const t = layer.linocut / 100;
    const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bayer = BAYER[y & 3][x & 3] / 16 * 60;
        const v = Math.min(255, Math.max(0, Math.round((lum + bayer) / 85) * 85));
        d[i]     = Math.round(d[i]     + (v - d[i])     * t);
        d[i + 1] = Math.round(d[i + 1] + (v - d[i + 1]) * t);
        d[i + 2] = Math.round(d[i + 2] + (v - d[i + 2]) * t);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.fog > 0) {
    const fogR = parseInt(layer.fogColor.slice(1, 3), 16);
    const fogG = parseInt(layer.fogColor.slice(3, 5), 16);
    const fogB = parseInt(layer.fogColor.slice(5, 7), 16);
    const t = layer.fog / 100;
    const imageData = ctx.getImageData(0, 0, W, H);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const w = Math.min(1, t * (0.2 + lum * 0.8));
      d[i]     = Math.round(d[i]     + (fogR - d[i])     * w);
      d[i + 1] = Math.round(d[i + 1] + (fogG - d[i + 1]) * w);
      d[i + 2] = Math.round(d[i + 2] + (fogB - d[i + 2]) * w);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.speedLines > 0) {
    const cx = W / 2, cy = H / 2;
    const diagonal = Math.sqrt(W * W + H * H);
    const count = Math.round(layer.speedLines * 0.8 + 20);
    const slRng = lcg(seed * 5523);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count; i++) {
      const angle = slRng() * Math.PI * 2;
      const length = diagonal * (0.4 + slRng() * 0.6);
      const alpha = (layer.speedLines / 100) * (0.05 + slRng() * 0.2);
      ctx.lineWidth = (0.5 + slRng() * 1.5) * scale;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function runGpuPass(
  current: HTMLCanvasElement,
  W: number,
  H: number,
  filters: Filter[],
): Promise<HTMLCanvasElement> {
  return gpuRenderToCanvas({ width: W, height: H, source: current, filters });
}

async function applyLayerToCanvas(
  base: HTMLCanvasElement,
  layer: Layer,
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  if (!layer.visible) return base;

  const scale = W / REF;
  const seed = doc.global.seed;
  let current = cloneCanvas(base, W, H);
  const ctx = current.getContext('2d', { willReadFrequently: true })!;

  if (layer.kind === 'emoji') {
    drawEmojiLayer(ctx, W, H, layer, lcg(seed ^ 0x7a8b9c), scale);
  } else if (layer.kind === 'text') {
    drawTextLayer(ctx, W, H, layer, scale);
  } else if (layer.kind === 'image') {
    drawImageLayer(ctx, W, H, layer, imageCache.get(layer.src) ?? null);
  } else if (layer.kind === 'fill') {
    drawFillLayer(ctx, W, H, layer);
  } else if (layer.kind === 'effect') {
    const alphaMask = layer.maskAlpha ? cloneCanvas(base, W, H) : null;
    applyCanvas2DEffects(ctx, W, H, layer, seed, scale, lcg(seed ^ 0x1a2b3c));
    if (!options.skipEffects) {
      const filters = buildFiltersFromEffectLayer(layer, seed, W, H);
      if (filters?.length) {
        current = await runGpuPass(current, W, H, filters);
      }
    }
    if (alphaMask) {
      current = maskCanvasToAlpha(current, alphaMask, W, H);
    }
  }

  return current;
}

function findIncomingSource(
  graph: CanvasGraph,
  toId: string,
  toPort: 'in' | 'bg' | 'a' | 'b',
): string | null {
  const edge = graph.edges.find((item) => item.toId === toId && item.toPort === toPort);
  return edge?.fromId ?? null;
}

function findMergeNode(graph: CanvasGraph, nodeId: string): GraphMergeNode | undefined {
  return graph.mergeNodes.find((node) => node.id === nodeId);
}

function findColorNode(graph: CanvasGraph, nodeId: string): GraphColorNode | undefined {
  return (graph.colorNodes ?? []).find((node) => node.id === nodeId);
}

function applyColorNode(source: HTMLCanvasElement, node: GraphColorNode, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);

  const { contrast, brightness, saturation, hue } = node;
  if (contrast === 100 && brightness === 100 && saturation === 100 && hue === 0) return canvas;

  const imageData = ctx.getImageData(0, 0, W, H);
  const d = imageData.data;

  // Factors matching CSS filter spec
  const bF = brightness / 100;
  const cF = contrast / 100;
  const sF = saturation / 100;

  // Hue rotation matrix from the CSS filter spec (W3C SVG feColorMatrix hueRotate)
  const hRad = (hue * Math.PI) / 180;
  const cos = Math.cos(hRad);
  const sin = Math.sin(hRad);
  const hr00 = 0.213 + cos * 0.787 - sin * 0.213;
  const hr01 = 0.715 - cos * 0.715 - sin * 0.715;
  const hr02 = 0.072 - cos * 0.072 + sin * 0.928;
  const hr10 = 0.213 - cos * 0.213 + sin * 0.143;
  const hr11 = 0.715 + cos * 0.285 + sin * 0.140;
  const hr12 = 0.072 - cos * 0.072 - sin * 0.283;
  const hr20 = 0.213 - cos * 0.213 - sin * 0.787;
  const hr21 = 0.715 - cos * 0.715 + sin * 0.715;
  const hr22 = 0.072 + cos * 0.928 + sin * 0.072;

  // Saturation matrix coefficients from the CSS filter spec
  const sm00 = 0.213 + 0.787 * sF, sm01 = 0.715 - 0.715 * sF, sm02 = 0.072 - 0.072 * sF;
  const sm10 = 0.213 - 0.213 * sF, sm11 = 0.715 + 0.285 * sF, sm12 = 0.072 - 0.072 * sF;
  const sm20 = 0.213 - 0.213 * sF, sm21 = 0.715 - 0.715 * sF, sm22 = 0.072 + 0.928 * sF;

  const applyHue = hue !== 0;
  const applySat = saturation !== 100;

  for (let i = 0; i < d.length; i += 4) {
    // Normalise to [0, 1]
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    // brightness: scale (CSS spec: linear multiply, clamp)
    r *= bF; g *= bF; b *= bF;

    // contrast: (v - 0.5) * c + 0.5
    r = (r - 0.5) * cF + 0.5;
    g = (g - 0.5) * cF + 0.5;
    b = (b - 0.5) * cF + 0.5;

    // saturation via color matrix
    if (applySat) {
      const nr = sm00 * r + sm01 * g + sm02 * b;
      const ng = sm10 * r + sm11 * g + sm12 * b;
      const nb = sm20 * r + sm21 * g + sm22 * b;
      r = nr; g = ng; b = nb;
    }

    // hue rotation via color matrix
    if (applyHue) {
      const nr = hr00 * r + hr01 * g + hr02 * b;
      const ng = hr10 * r + hr11 * g + hr12 * b;
      const nb = hr20 * r + hr21 * g + hr22 * b;
      r = nr; g = ng; b = nb;
    }

    d[i]     = Math.min(255, Math.max(0, Math.round(r * 255)));
    d[i + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
    d[i + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
    // alpha (i+3) unchanged
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function findLayer(doc: CanvasDocument, nodeId: string): Layer | undefined {
  return doc.layers.find((layer) => layer.id === nodeId);
}

export interface RenderOptions {
  /** Skip GPU effect passes during e.g. drag interactions for instant feedback. Canvas 2D effects and masking still apply. */
  skipEffects?: boolean;
  /** Choose whether to render via saved node graph or plain ordered layer stack. */
  graphMode?: 'auto' | 'graph' | 'stack';
}

async function renderGraphNode(
  doc: CanvasDocument,
  graph: CanvasGraph,
  nodeId: string,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
  cache: Map<string, Promise<HTMLCanvasElement>>,
): Promise<HTMLCanvasElement> {
  const cached = cache.get(nodeId);
  if (cached) return cached;

  const renderPromise = (async () => {
    if (nodeId === EXPORT_NODE_ID) {
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      drawBackground(ctx, W, H, doc.global.bg);
      const sourceId = findIncomingSource(graph, nodeId, 'in');
      if (sourceId) {
        const rendered = await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache);
        ctx.drawImage(rendered, 0, 0);
      }
      return canvas;
    }

    const mergeNode = findMergeNode(graph, nodeId);
    if (mergeNode) {
      const baseId = findIncomingSource(graph, nodeId, 'a');
      const overlayId = findIncomingSource(graph, nodeId, 'b');
      const canvas = baseId
        ? cloneCanvas(
          await renderGraphNode(doc, graph, baseId, W, H, imageCache, options, cache),
          W,
          H,
        )
        : createCanvas(W, H);
      if (overlayId) {
        const overlay = await renderGraphNode(doc, graph, overlayId, W, H, imageCache, options, cache);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.save();
        ctx.globalCompositeOperation = toCompositeOperation(mergeNode.blendMode);
        ctx.globalAlpha = mergeNode.opacity / 100;
        ctx.drawImage(overlay, 0, 0);
        ctx.restore();
      }
      return canvas;
    }

    const colorNode = findColorNode(graph, nodeId);
    if (colorNode) {
      const sourceId = findIncomingSource(graph, nodeId, 'in');
      const source = sourceId
        ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache)
        : createCanvas(W, H);
      return applyColorNode(source, colorNode, W, H);
    }

    const layer = findLayer(doc, nodeId);
    if (!layer) return createCanvas(W, H);

    const inputPort = layer.kind === 'effect' ? 'in' : 'bg';
    const sourceId = findIncomingSource(graph, nodeId, inputPort);
    const base = sourceId
      ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, options, cache)
      : createCanvas(W, H);
    return applyLayerToCanvas(base, layer, doc, W, H, imageCache, options);
  })();

  cache.set(nodeId, renderPromise);
  return renderPromise;
}

export async function renderGraphTarget(
  doc: CanvasDocument,
  graph: CanvasGraph,
  targetNodeId: string,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  return renderGraphNode(
    doc,
    graph,
    targetNodeId,
    W,
    H,
    imageCache,
    options,
    new Map<string, Promise<HTMLCanvasElement>>(),
  );
}

export async function renderDocument(
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  if (options.graphMode === 'graph' && doc.graph) {
    return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, options);
  }

  if (options.graphMode !== 'stack' && doc.graph) {
    return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, options);
  }

  // Stack mode: infer a linear graph from doc.layers and execute it.
  // This guarantees identical rendering logic between layer and node views,
  // bypassing any custom edges in doc.graph while preserving correct layer order.
  const tempGraph = inferLinearGraph(doc.layers);
  return renderGraphTarget(doc, tempGraph, EXPORT_NODE_ID, W, H, imageCache, options);
}
