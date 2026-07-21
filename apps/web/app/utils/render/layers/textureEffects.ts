import type { EffectLayer } from '../../../types/config';

export { applyGlitchEffect, applyGrain, applyScanlines } from '@shchilkin/artifact-runtime/rendering';

import { lcg } from '../../lcg';
import { createCanvas } from '../canvas';

export function applyDotGrain(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  seed: number,
  scale: number,
) {
  if (layer.dotGrain <= 0 || W <= 0 || H <= 0) return;

  const amount = Math.min(1, Math.max(0, layer.dotGrain / 100));
  const density = Math.min(1, Math.max(0.02, (layer.dotGrainDensity ?? 62) / 100));
  const jitter = Math.min(1, Math.max(0, (layer.dotGrainJitter ?? 35) / 100));
  const dotSize = Math.max(1, (layer.dotGrainSize ?? 4) * scale);
  const step = Math.max(2, dotSize * (1.35 + (1 - density) * 2.4));
  const maxRadius = Math.max(0.75, dotSize * 0.74);
  const source = ctx.getImageData(0, 0, W, H);
  const data = source.data;
  const dotRng = lcg(seed * 8111);
  const dots = createCanvas(W, H);
  const dctx = dots.getContext('2d')!;

  dctx.fillStyle = '#050008';
  for (let y = step * 0.5; y < H; y += step) {
    for (let x = step * 0.5; x < W; x += step) {
      const jx = (dotRng() - 0.5) * step * jitter;
      const jy = (dotRng() - 0.5) * step * jitter;
      const sx = Math.min(W - 1, Math.max(0, Math.round(x + jx)));
      const sy = Math.min(H - 1, Math.max(0, Math.round(y + jy)));
      const i = (sy * W + sx) * 4;
      const alpha = (data[i + 3] ?? 0) / 255;
      if (alpha <= 0.02) continue;
      const lum = ((data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114) / 255;
      const tone = Math.max(0, Math.min(1, 1 - lum));
      const stochastic = 0.72 + dotRng() * 0.42;
      const radius = maxRadius * Math.pow(tone, 0.82) * stochastic;
      if (radius < 0.25) continue;
      dctx.globalAlpha = Math.min(1, amount * alpha * (0.34 + tone * 0.76));
      dctx.beginPath();
      dctx.arc(sx, sy, radius, 0, Math.PI * 2);
      dctx.fill();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(dots, 0, 0);
  ctx.restore();
}

export function applyMatte(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer, seed: number) {
  if (layer.matte <= 0) return;

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

export function applyEmboss(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer) {
  if (layer.emboss <= 0) return;

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

export function applyLinocut(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer) {
  if (layer.linocut <= 0) return;

  const t = layer.linocut / 100;
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const imageData = ctx.getImageData(0, 0, W, H);
  const d = imageData.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const bayer = (BAYER[y & 3][x & 3] / 16) * 60;
      const v = Math.min(255, Math.max(0, Math.round((lum + bayer) / 85) * 85));
      d[i] = Math.round(d[i] + (v - d[i]) * t);
      d[i + 1] = Math.round(d[i + 1] + (v - d[i + 1]) * t);
      d[i + 2] = Math.round(d[i + 2] + (v - d[i + 2]) * t);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
