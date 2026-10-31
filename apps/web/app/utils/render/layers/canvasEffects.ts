import type { EffectLayer } from '../../../types/config';
import { DEFAULT_EFFECT_LAYER_PROPS } from '../../../types/config';
import { lcg } from '../../lcg';
import { createCanvas, REF } from '../canvas';
import type { EffectPixelTransformOp } from '../workers/effectPixelTransform';
import { renderEffectPixelTransforms } from '../workers/effectPixelTransformClient';
import { applyBadStreamEffect } from './badStream';
import { applyDotGrain, applyEmboss, applyGrain, applyLinocut, applyMatte, applyScanlines } from './textureEffects';

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function parseHexRgb(value: unknown, fallback: string): [number, number, number] {
  const hex = typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : fallback;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
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

function applyRayEffect(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer, rng: () => number) {
  if (layer.rayInt <= 0 || layer.rays <= 0) return;
  const cx = W / 2;
  const cy = H / 2;
  const diagonal = Math.sqrt(W * W + H * H);
  const [r, g, b] = parseHexRgb(layer.rayColor, DEFAULT_EFFECT_LAYER_PROPS.rayColor);
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

function glitchFillStyle(index: number, opacity: number): string {
  return index % 2 === 0 ? `rgba(0,210,255,${opacity})` : `rgba(255,0,200,${opacity})`;
}

function applyGlitchEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  scale: number,
  rng: () => number,
) {
  if (layer.glitch <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < layer.glitch; i++) {
    const y = rng() * H;
    const h = (1 + rng() * 3) * scale;
    const x = rng() * W * 0.3;
    const w = W * (0.3 + rng() * 0.7);
    const opacity = 0.12 + rng() * 0.25;
    ctx.fillStyle = glitchFillStyle(i, opacity);
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function applyTintEffect(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer) {
  if (layer.tintOp <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = layer.tintOp / 100;
  ctx.fillStyle = layer.tint;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

async function applyColorPassEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  scale: number,
) {
  const needsPixelPass = layer.sepia > 0 || layer.infrared > 0 || layer.ca > 0 || layer.dither > 0;
  if (!needsPixelPass) return;
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

function indexedPaletteColors(layer: EffectLayer): string[] {
  const count = Math.min(6, Math.max(2, Math.round(layer.indexedPaletteCount ?? 6)));
  return [
    layer.indexedColorA,
    layer.indexedColorB,
    layer.indexedColorC,
    layer.indexedColorD,
    layer.indexedColorE,
    layer.indexedColorF,
  ].slice(0, count);
}

async function applySingleImageDataTransform(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  enabled: boolean,
  operation: EffectPixelTransformOp,
) {
  if (!enabled) return;
  await applyImageDataTransforms(ctx, W, H, [operation]);
}

function applyZoomBlurEffect(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer) {
  if (layer.zoomBlur <= 0) return;
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

function applyRetroResolutionEffect(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer) {
  if (layer.retroResolution <= 0) return;
  const outputLongestEdge = Math.max(W, H);
  const longestEdge = Math.max(8, Math.round(layer.retroResolution * (outputLongestEdge / REF)));
  const downscale = longestEdge / outputLongestEdge;
  if (downscale >= 1) return;
  const lowW = Math.max(1, Math.round(W * downscale));
  const lowH = Math.max(1, Math.round(H * downscale));
  const low = createCanvas(lowW, lowH);
  const lowCtx = low.getContext('2d', { willReadFrequently: true })!;
  lowCtx.imageSmoothingEnabled = true;
  lowCtx.drawImage(ctx.canvas, 0, 0, lowW, lowH);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(low, 0, 0, W, H);
  ctx.restore();
}

function applyNeonGlowEffect(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer, scale: number) {
  if (layer.neonGlow <= 0) return;
  const [r6, g6, b6] = parseHexRgb(layer.neonColor, DEFAULT_EFFECT_LAYER_PROPS.neonColor);
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

function createOverprintPlate(
  W: number,
  H: number,
  sourceData: Uint8ClampedArray,
  shiftX: number,
  shiftY: number,
  color: [number, number, number],
): HTMLCanvasElement {
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
      const lum = 0.299 * sourceData[si] + 0.587 * sourceData[si + 1] + 0.114 * sourceData[si + 2];
      pd[oi] = color[0];
      pd[oi + 1] = color[1];
      pd[oi + 2] = color[2];
      pd[oi + 3] = Math.round(255 - lum);
    }
  }
  pctx.putImageData(pid, 0, 0);
  return c;
}

function applyOverprintEffect(ctx: CanvasRenderingContext2D, W: number, H: number, layer: EffectLayer, scale: number) {
  if (layer.overprint <= 0) return;
  const shift = Math.round(layer.overprint * scale * 0.12);
  const sourceData = ctx.getImageData(0, 0, W, H).data;
  const cyan = createOverprintPlate(W, H, sourceData, shift, 0, [0, 255, 255]);
  const magenta = createOverprintPlate(W, H, sourceData, -shift, shift, [255, 0, 255]);
  const yellow = createOverprintPlate(W, H, sourceData, 0, -shift, [255, 255, 0]);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = (layer.overprint / 100) * 0.7;
  ctx.drawImage(cyan, 0, 0);
  ctx.drawImage(magenta, 0, 0);
  ctx.drawImage(yellow, 0, 0);
  ctx.restore();
}

function applySpeedLinesEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  seed: number,
  scale: number,
) {
  if (layer.speedLines <= 0) return;
  const cx = W / 2;
  const cy = H / 2;
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

export async function applyCanvas2DEffects(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  seed: number,
  scale: number,
  rng: () => number,
) {
  applyRetroResolutionEffect(ctx, W, H, layer);
  applyRayEffect(ctx, W, H, layer, rng);
  applyGlitchEffect(ctx, W, H, layer, scale, rng);
  applyBadStreamEffect(ctx, W, H, layer, seed, scale);
  await applySingleImageDataTransform(ctx, W, H, layer.rgbSplit > 0, {
    type: 'rgbSplit',
    amount: Math.round(layer.rgbSplit * scale),
  });

  applyScanlines(ctx, W, H, layer, scale);
  applyGrain(ctx, W, H, layer, seed);
  applyDotGrain(ctx, W, H, layer, seed, scale);
  applyTintEffect(ctx, W, H, layer);
  await applyColorPassEffect(ctx, W, H, layer, scale);
  await applySingleImageDataTransform(ctx, W, H, layer.indexedPalette > 0, {
    type: 'indexedPalette',
    amount: layer.indexedPalette,
    colors: indexedPaletteColors(layer),
  });
  await applySingleImageDataTransform(ctx, W, H, layer.gradientMap > 0, {
    type: 'gradientMap',
    amount: layer.gradientMap,
    shadow: layer.gradientMapShadow,
    mid: layer.gradientMapMid,
    highlight: layer.gradientMapHighlight,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.channelMixer > 0, {
    type: 'channelMixer',
    amount: layer.channelMixer,
    redMix: layer.channelRedMix,
    greenMix: layer.channelGreenMix,
    blueMix: layer.channelBlueMix,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.edgeCrush > 0, {
    type: 'edgeCrush',
    amount: layer.edgeCrush,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.silhouetteCrush > 0, {
    type: 'silhouetteCrush',
    amount: layer.silhouetteCrush,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.pixelStretch > 0, {
    type: 'pixelStretch',
    amount: layer.pixelStretch,
    length: Math.max(1, layer.pixelStretchLength * scale),
    angle: layer.pixelStretchAngle,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.bokehBlur > 0, {
    type: 'bokehBlur',
    amount: Math.max(1, layer.bokehBlur * scale),
    threshold: layer.bokehThreshold,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.hatching > 0, {
    type: 'hatching',
    amount: layer.hatching,
    scale: Math.max(3, layer.hatchScale * scale),
    angle: layer.hatchAngle,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.vhsTracking > 0, {
    type: 'vhsTracking',
    amount: layer.vhsTracking,
    seed: seed ^ 0x1a2b3c,
  });

  applyMatte(ctx, W, H, layer, seed);
  await applySingleImageDataTransform(ctx, W, H, layer.waveAmt > 0, {
    type: 'wave',
    amount: layer.waveAmt,
    frequency: layer.waveFreq,
    scale,
  });
  applyZoomBlurEffect(ctx, W, H, layer);
  applyNeonGlowEffect(ctx, W, H, layer, scale);
  applyOverprintEffect(ctx, W, H, layer, scale);

  await applySingleImageDataTransform(ctx, W, H, layer.solarize > 0, { type: 'solarize', amount: layer.solarize });
  await applySingleImageDataTransform(ctx, W, H, layer.bleachBypass > 0, {
    type: 'bleachBypass',
    amount: layer.bleachBypass,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.cyanotype > 0, { type: 'cyanotype', amount: layer.cyanotype });
  await applySingleImageDataTransform(ctx, W, H, layer.splitToneAmt > 0, {
    type: 'splitTone',
    amount: layer.splitToneAmt,
    shadow: layer.splitShadow,
    highlight: layer.splitHighlight,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.rippleAmt > 0, {
    type: 'ripple',
    amount: layer.rippleAmt,
    frequency: layer.rippleFreq,
    scale,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.patternRefraction > 0, {
    type: 'patternRefraction',
    amount: layer.patternRefraction,
    scale: Math.max(3, layer.patternRefractionScale * scale),
    angle: layer.patternRefractionAngle,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.kaleidoscope > 0, {
    type: 'kaleidoscope',
    amount: layer.kaleidoscope,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.squeezeX !== 0 || layer.squeezeY !== 0, {
    type: 'squeeze',
    x: layer.squeezeX,
    y: layer.squeezeY,
  });

  applyEmboss(ctx, W, H, layer);
  applyLinocut(ctx, W, H, layer);
  await applySingleImageDataTransform(ctx, W, H, layer.fog > 0, {
    type: 'fog',
    amount: layer.fog,
    color: layer.fogColor,
  });
  await applySingleImageDataTransform(ctx, W, H, layer.gooeyMerge > 0, {
    type: 'gooeyMerge',
    amount: layer.gooeyMerge,
    radius: Math.max(1, layer.gooeyRadius * scale),
    threshold: layer.gooeyThreshold,
  });
  applySpeedLinesEffect(ctx, W, H, layer, seed, scale);
}
