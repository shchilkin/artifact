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
import type { EffectPixelTransformOp } from '../workers/effectPixelTransform';
import { renderEffectPixelTransforms } from '../workers/effectPixelTransformClient';
import { applyEmboss, applyGrain, applyLinocut, applyMatte, applyScanlines } from './textureEffects';

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
  /** Transient render cancellation signal. Never store this in document state. */
  signal?: AbortSignal;
}

function throwIfRenderAborted(options: RenderOptions): void {
  if (!options.signal?.aborted) return;
  const error = new Error('Render aborted');
  error.name = 'AbortError';
  throw error;
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

async function applyImageDataTransforms(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  operations: EffectPixelTransformOp[],
) {
  if (operations.length === 0) return;
  const imageData = ctx.getImageData(0, 0, W, H);
  const result = await renderEffectPixelTransforms({
    width: W,
    height: H,
    data: imageData.data,
    operations,
  });
  const output = ctx.createImageData(result.width, result.height);
  output.data.set(result.data);
  ctx.putImageData(output, 0, 0);
}

async function applyCanvas2DEffects(
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
    await applyImageDataTransforms(ctx, W, H, [{ type: 'rgbSplit', amount: Math.round(layer.rgbSplit * scale) }]);
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
    await applyImageDataTransforms(ctx, W, H, [
      {
        type: 'colorPass',
        sepia: layer.sepia,
        infrared: layer.infrared,
        ca: Math.round(layer.ca * scale),
        dither: layer.dither,
      },
    ]);
  }

  if (layer.vhsTracking > 0) {
    await applyImageDataTransforms(ctx, W, H, [
      { type: 'vhsTracking', amount: layer.vhsTracking, seed: seed ^ 0x1a2b3c },
    ]);
  }

  applyMatte(ctx, W, H, layer, seed);

  if (layer.waveAmt > 0) {
    await applyImageDataTransforms(ctx, W, H, [
      { type: 'wave', amount: layer.waveAmt, frequency: layer.waveFreq, scale },
    ]);
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
    await applyImageDataTransforms(ctx, W, H, [{ type: 'solarize', amount: layer.solarize }]);
  }

  if (layer.bleachBypass > 0) {
    await applyImageDataTransforms(ctx, W, H, [{ type: 'bleachBypass', amount: layer.bleachBypass }]);
  }

  if (layer.cyanotype > 0) {
    await applyImageDataTransforms(ctx, W, H, [{ type: 'cyanotype', amount: layer.cyanotype }]);
  }

  if (layer.splitToneAmt > 0) {
    await applyImageDataTransforms(ctx, W, H, [
      {
        type: 'splitTone',
        amount: layer.splitToneAmt,
        shadow: layer.splitShadow,
        highlight: layer.splitHighlight,
      },
    ]);
  }

  if (layer.rippleAmt > 0) {
    await applyImageDataTransforms(ctx, W, H, [
      { type: 'ripple', amount: layer.rippleAmt, frequency: layer.rippleFreq, scale },
    ]);
  }

  if (layer.kaleidoscope > 0) {
    await applyImageDataTransforms(ctx, W, H, [{ type: 'kaleidoscope', amount: layer.kaleidoscope }]);
  }

  if (layer.squeezeX !== 0 || layer.squeezeY !== 0) {
    await applyImageDataTransforms(ctx, W, H, [{ type: 'squeeze', x: layer.squeezeX, y: layer.squeezeY }]);
  }

  applyEmboss(ctx, W, H, layer);
  applyLinocut(ctx, W, H, layer);

  if (layer.fog > 0) {
    await applyImageDataTransforms(ctx, W, H, [{ type: 'fog', amount: layer.fog, color: layer.fogColor }]);
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
  throwIfRenderAborted(options);
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
    throwIfRenderAborted(options);
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
        throwIfRenderAborted(options);
        const scaled = createCanvas(W, H);
        const scaledCtx = scaled.getContext('2d', { willReadFrequently: true })!;
        scaledCtx.imageSmoothingEnabled = false;
        scaledCtx.drawImage(renderedEffect, 0, 0, W, H);
        return scaled;
      }
    }
    const alphaMask = layer.maskAlpha ? cloneCanvas(base, W, H) : null;
    await applyCanvas2DEffects(ctx, W, H, layer, seed, scale, lcg(seed ^ 0x1a2b3c));
    throwIfRenderAborted(options);
    if (!options.skipEffects) {
      const filters = buildFiltersFromEffectLayer(layer, seed, W, H);
      if (filters?.length) {
        current = await runGpuPass(current, W, H, filters);
        throwIfRenderAborted(options);
      }
    }
    if (alphaMask) {
      current = maskCanvasToAlpha(current, alphaMask, W, H);
    }
  }

  throwIfRenderAborted(options);
  return current;
}
