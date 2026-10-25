import { EFFECT_PARAM_DEFAULTS, type EffectParamValues } from '../../../types/effectSchema';
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

function applyRayEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: EffectParamValues,
  rng: () => number,
) {
  if (params.rayInt <= 0 || params.rays <= 0) return;
  const cx = W / 2;
  const cy = H / 2;
  const diagonal = Math.sqrt(W * W + H * H);
  const [r, g, b] = parseHexRgb(params.rayColor, EFFECT_PARAM_DEFAULTS.rayColor);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < params.rays; i++) {
    const baseAngle = (i / params.rays) * Math.PI * 2;
    const spread = (rng() - 0.5) * 0.6;
    const angle = baseAngle + spread;
    const width = (0.01 + rng() * 0.08) * diagonal;
    const alpha = (params.rayInt / 100) * (0.2 + rng() * 0.55);
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
  params: EffectParamValues,
  scale: number,
  rng: () => number,
) {
  if (params.glitch <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < params.glitch; i++) {
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

function applyTintEffect(ctx: CanvasRenderingContext2D, W: number, H: number, params: EffectParamValues) {
  if (params.tintOp <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = params.tintOp / 100;
  ctx.fillStyle = params.tint;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

async function applyColorPassEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: EffectParamValues,
  scale: number,
) {
  const needsPixelPass = params.sepia > 0 || params.infrared > 0 || params.ca > 0 || params.dither > 0;
  if (!needsPixelPass) return;
  await applyImageDataTransforms(ctx, W, H, [
    {
      type: 'colorPass',
      sepia: params.sepia,
      infrared: params.infrared,
      ca: Math.round(params.ca * scale),
      dither: params.dither,
    },
  ]);
}

function indexedPaletteColors(params: EffectParamValues): string[] {
  const count = Math.min(6, Math.max(2, Math.round(params.indexedPaletteCount ?? 6)));
  return [
    params.indexedColorA,
    params.indexedColorB,
    params.indexedColorC,
    params.indexedColorD,
    params.indexedColorE,
    params.indexedColorF,
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

function applyZoomBlurEffect(ctx: CanvasRenderingContext2D, W: number, H: number, params: EffectParamValues) {
  if (params.zoomBlur <= 0) return;
  const snapshot = createCanvas(W, H);
  const sctx = snapshot.getContext('2d')!;
  sctx.drawImage(ctx.canvas, 0, 0);
  const steps = 8;
  const maxScale = 1 + (params.zoomBlur / 100) * 0.18;
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

function applyRetroResolutionEffect(ctx: CanvasRenderingContext2D, W: number, H: number, params: EffectParamValues) {
  if (params.retroResolution <= 0) return;
  const outputLongestEdge = Math.max(W, H);
  const longestEdge = Math.max(8, Math.round(params.retroResolution * (outputLongestEdge / REF)));
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

function applyNeonGlowEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: EffectParamValues,
  scale: number,
) {
  if (params.neonGlow <= 0) return;
  const [r6, g6, b6] = parseHexRgb(params.neonColor, EFFECT_PARAM_DEFAULTS.neonColor);
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
  const blurPx = Math.round((params.neonGlow / 100) * 18 * scale);
  gctx.filter = `blur(${blurPx}px)`;
  gctx.drawImage(bright, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(1, (params.neonGlow / 100) * 1.4);
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

function applyOverprintEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: EffectParamValues,
  scale: number,
) {
  if (params.overprint <= 0) return;
  const shift = Math.round(params.overprint * scale * 0.12);
  const sourceData = ctx.getImageData(0, 0, W, H).data;
  const cyan = createOverprintPlate(W, H, sourceData, shift, 0, [0, 255, 255]);
  const magenta = createOverprintPlate(W, H, sourceData, -shift, shift, [255, 0, 255]);
  const yellow = createOverprintPlate(W, H, sourceData, 0, -shift, [255, 255, 0]);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = (params.overprint / 100) * 0.7;
  ctx.drawImage(cyan, 0, 0);
  ctx.drawImage(magenta, 0, 0);
  ctx.drawImage(yellow, 0, 0);
  ctx.restore();
}

function applySpeedLinesEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: EffectParamValues,
  seed: number,
  scale: number,
) {
  if (params.speedLines <= 0) return;
  const cx = W / 2;
  const cy = H / 2;
  const diagonal = Math.sqrt(W * W + H * H);
  const count = Math.round(params.speedLines * 0.8 + 20);
  const slRng = lcg(seed * 5523);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < count; i++) {
    const angle = slRng() * Math.PI * 2;
    const length = diagonal * (0.4 + slRng() * 0.6);
    const alpha = (params.speedLines / 100) * (0.05 + slRng() * 0.2);
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
  params: EffectParamValues,
  seed: number,
  scale: number,
  rng: () => number,
) {
  applyRetroResolutionEffect(ctx, W, H, params);
  applyRayEffect(ctx, W, H, params, rng);
  applyGlitchEffect(ctx, W, H, params, scale, rng);
  applyBadStreamEffect(ctx, W, H, params, seed, scale);
  await applySingleImageDataTransform(ctx, W, H, params.rgbSplit > 0, {
    type: 'rgbSplit',
    amount: Math.round(params.rgbSplit * scale),
  });

  applyScanlines(ctx, W, H, params, scale);
  applyGrain(ctx, W, H, params, seed);
  applyDotGrain(ctx, W, H, params, seed, scale);
  applyTintEffect(ctx, W, H, params);
  await applyColorPassEffect(ctx, W, H, params, scale);
  await applySingleImageDataTransform(ctx, W, H, params.indexedPalette > 0, {
    type: 'indexedPalette',
    amount: params.indexedPalette,
    colors: indexedPaletteColors(params),
  });
  await applySingleImageDataTransform(ctx, W, H, params.gradientMap > 0, {
    type: 'gradientMap',
    amount: params.gradientMap,
    shadow: params.gradientMapShadow,
    mid: params.gradientMapMid,
    highlight: params.gradientMapHighlight,
  });
  await applySingleImageDataTransform(ctx, W, H, params.channelMixer > 0, {
    type: 'channelMixer',
    amount: params.channelMixer,
    redMix: params.channelRedMix,
    greenMix: params.channelGreenMix,
    blueMix: params.channelBlueMix,
  });
  await applySingleImageDataTransform(ctx, W, H, params.edgeCrush > 0, {
    type: 'edgeCrush',
    amount: params.edgeCrush,
  });
  await applySingleImageDataTransform(ctx, W, H, params.silhouetteCrush > 0, {
    type: 'silhouetteCrush',
    amount: params.silhouetteCrush,
  });
  await applySingleImageDataTransform(ctx, W, H, params.pixelStretch > 0, {
    type: 'pixelStretch',
    amount: params.pixelStretch,
    length: Math.max(1, params.pixelStretchLength * scale),
    angle: params.pixelStretchAngle,
  });
  await applySingleImageDataTransform(ctx, W, H, params.bokehBlur > 0, {
    type: 'bokehBlur',
    amount: Math.max(1, params.bokehBlur * scale),
    threshold: params.bokehThreshold,
  });
  await applySingleImageDataTransform(ctx, W, H, params.hatching > 0, {
    type: 'hatching',
    amount: params.hatching,
    scale: Math.max(3, params.hatchScale * scale),
    angle: params.hatchAngle,
  });
  await applySingleImageDataTransform(ctx, W, H, params.vhsTracking > 0, {
    type: 'vhsTracking',
    amount: params.vhsTracking,
    seed: seed ^ 0x1a2b3c,
  });

  applyMatte(ctx, W, H, params, seed);
  await applySingleImageDataTransform(ctx, W, H, params.waveAmt > 0, {
    type: 'wave',
    amount: params.waveAmt,
    frequency: params.waveFreq,
    scale,
  });
  applyZoomBlurEffect(ctx, W, H, params);
  applyNeonGlowEffect(ctx, W, H, params, scale);
  applyOverprintEffect(ctx, W, H, params, scale);

  await applySingleImageDataTransform(ctx, W, H, params.solarize > 0, { type: 'solarize', amount: params.solarize });
  await applySingleImageDataTransform(ctx, W, H, params.bleachBypass > 0, {
    type: 'bleachBypass',
    amount: params.bleachBypass,
  });
  await applySingleImageDataTransform(ctx, W, H, params.cyanotype > 0, { type: 'cyanotype', amount: params.cyanotype });
  await applySingleImageDataTransform(ctx, W, H, params.splitToneAmt > 0, {
    type: 'splitTone',
    amount: params.splitToneAmt,
    shadow: params.splitShadow,
    highlight: params.splitHighlight,
  });
  await applySingleImageDataTransform(ctx, W, H, params.rippleAmt > 0, {
    type: 'ripple',
    amount: params.rippleAmt,
    frequency: params.rippleFreq,
    scale,
  });
  await applySingleImageDataTransform(ctx, W, H, params.patternRefraction > 0, {
    type: 'patternRefraction',
    amount: params.patternRefraction,
    scale: Math.max(3, params.patternRefractionScale * scale),
    angle: params.patternRefractionAngle,
  });
  await applySingleImageDataTransform(ctx, W, H, params.kaleidoscope > 0, {
    type: 'kaleidoscope',
    amount: params.kaleidoscope,
  });
  await applySingleImageDataTransform(ctx, W, H, params.squeezeX !== 0 || params.squeezeY !== 0, {
    type: 'squeeze',
    x: params.squeezeX,
    y: params.squeezeY,
  });

  applyEmboss(ctx, W, H, params);
  applyLinocut(ctx, W, H, params);
  await applySingleImageDataTransform(ctx, W, H, params.fog > 0, {
    type: 'fog',
    amount: params.fog,
    color: params.fogColor,
  });
  await applySingleImageDataTransform(ctx, W, H, params.gooeyMerge > 0, {
    type: 'gooeyMerge',
    amount: params.gooeyMerge,
    radius: Math.max(1, params.gooeyRadius * scale),
    threshold: params.gooeyThreshold,
  });
  applySpeedLinesEffect(ctx, W, H, params, seed, scale);
}
