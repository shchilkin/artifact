import type { Filter } from 'pixi.js';
import type { PrimitiveViewportState } from '../../../components/PrimitiveViewportState';
import type {
  CanvasDocument,
  EffectLayer,
  EmojiLayer,
  FillLayer,
  ImageLayer,
  Layer,
  TextLayer,
} from '../../../types/config';
import { FONT_STACKS } from '../../../types/config';
import { gpuRenderToCanvas } from '../../gpuRender';
import { lcg } from '../../lcg';
import { buildFiltersFromEffectLayer } from '../../pixiFilters';
import { drawSourceLayer } from '../../proceduralSource';
import { cloneCanvas, createCanvas, maskCanvasToAlpha, REF, toCompositeOperation } from '../canvas';
import {
  applyDitherToImageData,
  applyEmboss,
  applyGrain,
  applyLinocut,
  applyMatte,
  applyScanlines,
} from './textureEffects';

export interface RenderOptions {
  /** Skip GPU effect passes during e.g. drag interactions for instant feedback. Canvas 2D effects and masking still apply. */
  skipEffects?: boolean;
  /** Use lighter-weight source rendering while interactive controls are moving, then settle back to full quality. */
  draft?: boolean;
  /** Choose whether to render via saved node graph or plain ordered layer stack. */
  graphMode?: 'auto' | 'graph' | 'stack';
  /** Optional live primitive viewport overrides so node/output/export renders can match the interactive 3D preview. */
  primitiveViewStates?: Record<string, PrimitiveViewportState>;
  /** Source nodes render as full-frame generators in graph mode; stack mode keeps authored placement. */
  sourceLayout?: 'document' | 'full-frame';
  /** Optional stable effect pass resolution so export scale changes density, not the effect recipe. */
  effectResolution?: { width: number; height: number };
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

function drawFillLayer(ctx: CanvasRenderingContext2D, W: number, H: number, layer: FillLayer) {
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

function drawTextLayer(ctx: CanvasRenderingContext2D, W: number, H: number, layer: TextLayer, scale: number) {
  if (!layer.content.trim()) return;
  const fontSize = layer.size * scale;
  const fontStack = FONT_STACKS[layer.font] ?? FONT_STACKS.MONO;

  ctx.save();
  ctx.font = `${fontSize}px ${fontStack}`; // must be set before wrapText uses measureText
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

        data[i] = copy[ri]; // Red channel shifted down-right
        data[i + 2] = copy[bi + 2]; // Blue channel shifted up-left
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  applyScanlines(ctx, W, H, layer, scale);
  applyGrain(ctx, W, H, layer, seed);

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
      const cx = W / 2,
        cy = H / 2;
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

    applyDitherToImageData(imageData, W, H, layer);

    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.vhsTracking > 0) {
    const srcData = ctx.getImageData(0, 0, W, H);
    const bands = Math.max(3, Math.floor(layer.vhsTracking * 0.25 + 3));
    const maxShift = Math.max(1, Math.floor((layer.vhsTracking * 0.08 * W) / 100));
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
          od[oi] = sd[sri];
          od[oi + 1] = sd[si + 1];
          od[oi + 2] = sd[si + 2];
          od[oi + 3] = sd[si + 3];
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  applyMatte(ctx, W, H, layer, seed);

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
        od[oi] = sd[si];
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
      ctx.drawImage(snapshot, ((1 - s) * W) / 2, ((1 - s) * H) / 2, W * s, H * s);
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
      bd[i] = Math.round(r6 * t);
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
          pd[oi] = pr;
          pd[oi + 1] = pg;
          pd[oi + 2] = pb;
          pd[oi + 3] = Math.round(255 - lum);
        }
      }
      pctx.putImageData(pid, 0, 0);
      return c;
    }

    const cyan = makePlate(shift, 0, 0, 255, 255);
    const magenta = makePlate(-shift, shift, 255, 0, 255);
    const yellow = makePlate(0, -shift, 255, 255, 0);

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
        d[i] = 255 - d[i];
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
      const r = d[i],
        g = d[i + 1],
        b = d[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const ov = (c: number) => (c < 128 ? (2 * c * lum) / 255 : 255 - (2 * (255 - c) * (255 - lum)) / 255);
      d[i] = Math.min(255, Math.round(r + (ov(r) - r) * t));
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
      const cr = Math.round(0 + (235 - 0) * lum);
      const cg = Math.round(49 + (240 - 49) * lum);
      const cb = Math.round(83 + (230 - 83) * lum);
      d[i] = Math.round(d[i] + (cr - d[i]) * t);
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
      d[i] = Math.min(255, Math.round(d[i] + (sR - d[i]) * sw * t + (hR - d[i]) * hw * t));
      d[i + 1] = Math.min(255, Math.round(d[i + 1] + (sG - d[i + 1]) * sw * t + (hG - d[i + 1]) * hw * t));
      d[i + 2] = Math.min(255, Math.round(d[i + 2] + (sB - d[i + 2]) * sw * t + (hB - d[i + 2]) * hw * t));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.rippleAmt > 0) {
    const cx = W / 2,
      cy = H / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const maxShift = layer.rippleAmt * scale * 0.5;
    const freq = (layer.rippleFreq * Math.PI * 2) / maxDist;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data,
      od = out.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx,
          dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const shift = Math.sin(dist * freq) * maxShift;
        const nx = Math.min(W - 1, Math.max(0, Math.round(cx + (dist + shift) * Math.cos(angle))));
        const ny = Math.min(H - 1, Math.max(0, Math.round(cy + (dist + shift) * Math.sin(angle))));
        const oi = (y * W + x) * 4,
          si = (ny * W + nx) * 4;
        od[oi] = sd[si];
        od[oi + 1] = sd[si + 1];
        od[oi + 2] = sd[si + 2];
        od[oi + 3] = sd[si + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.kaleidoscope > 0) {
    const segments = Math.max(3, Math.round(3 + (layer.kaleidoscope / 100) * 13));
    const sectorAngle = (Math.PI * 2) / segments;
    const cx = W / 2,
      cy = H / 2;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data,
      od = out.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx,
          dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;
        let a = angle % sectorAngle;
        if (a > sectorAngle / 2) a = sectorAngle - a;
        const nx = Math.min(W - 1, Math.max(0, Math.round(cx + dist * Math.cos(a))));
        const ny = Math.min(H - 1, Math.max(0, Math.round(cy + dist * Math.sin(a))));
        const oi = (y * W + x) * 4,
          si = (ny * W + nx) * 4;
        od[oi] = sd[si];
        od[oi + 1] = sd[si + 1];
        od[oi + 2] = sd[si + 2];
        od[oi + 3] = sd[si + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  if (layer.squeezeX !== 0 || layer.squeezeY !== 0) {
    const xFactor = Math.max(0.01, 1 + layer.squeezeX / 100);
    const yFactor = Math.max(0.01, 1 + layer.squeezeY / 100);
    const cx = W / 2,
      cy = H / 2;
    const srcData = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const sd = srcData.data,
      od = out.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, Math.round(cx + (x - cx) / xFactor)));
        const sy = Math.min(H - 1, Math.max(0, Math.round(cy + (y - cy) / yFactor)));
        const oi = (y * W + x) * 4,
          si = (sy * W + sx) * 4;
        od[oi] = sd[si];
        od[oi + 1] = sd[si + 1];
        od[oi + 2] = sd[si + 2];
        od[oi + 3] = sd[si + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  applyEmboss(ctx, W, H, layer);
  applyLinocut(ctx, W, H, layer);

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
      d[i] = Math.round(d[i] + (fogR - d[i]) * w);
      d[i + 1] = Math.round(d[i + 1] + (fogG - d[i + 1]) * w);
      d[i + 2] = Math.round(d[i + 2] + (fogB - d[i + 2]) * w);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (layer.speedLines > 0) {
    const cx = W / 2,
      cy = H / 2;
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

function runGpuPass(current: HTMLCanvasElement, W: number, H: number, filters: Filter[]): Promise<HTMLCanvasElement> {
  return gpuRenderToCanvas({ width: W, height: H, source: current, filters });
}

export async function applyLayerToCanvas(
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
  } else if (layer.kind === 'primitive' || layer.kind === 'noise' || layer.kind === 'array') {
    const sourceLayout = layer.kind === 'primitive' ? 'full-frame' : (options.sourceLayout ?? 'document');
    await drawSourceLayer(
      ctx,
      W,
      H,
      layer,
      seed,
      scale,
      options.draft ?? false,
      layer.kind === 'primitive' ? options.primitiveViewStates?.[layer.id] : undefined,
      sourceLayout,
    );
  } else if (layer.kind === 'effect') {
    if (options.skipEffects) return base;
    const effectResolution = options.effectResolution;
    if (effectResolution) {
      const effectW = Math.min(W, Math.max(1, Math.round(effectResolution.width)));
      const effectH = Math.min(H, Math.max(1, Math.round(effectResolution.height)));
      if (effectW !== W || effectH !== H) {
        const effectBase = createCanvas(effectW, effectH);
        const effectCtx = effectBase.getContext('2d', { willReadFrequently: true })!;
        effectCtx.drawImage(base, 0, 0, effectW, effectH);
        const renderedEffect = await applyLayerToCanvas(effectBase, layer, doc, effectW, effectH, imageCache, {
          ...options,
          effectResolution: undefined,
        });
        const scaled = createCanvas(W, H);
        const scaledCtx = scaled.getContext('2d', { willReadFrequently: true })!;
        scaledCtx.imageSmoothingEnabled = false;
        scaledCtx.drawImage(renderedEffect, 0, 0, W, H);
        return scaled;
      }
    }
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
