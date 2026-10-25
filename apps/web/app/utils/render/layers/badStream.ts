import type { KernelParamValues } from '../../../types/effectKernels';
import { lcg } from '../../lcg';
import { cloneCanvas } from '../canvas';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type RgbaTuple = [number, number, number, number];

function averageBlockColor(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  x: number,
  y: number,
  w: number,
  h: number,
  stride: number,
): RgbaTuple {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  const xEnd = Math.min(W, x + w);
  const yEnd = Math.min(H, y + h);
  for (let yy = y; yy < yEnd; yy += stride) {
    for (let xx = x; xx < xEnd; xx += stride) {
      const i = (yy * W + xx) * 4;
      const alpha = data[i + 3] ?? 0;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      a += alpha;
      count++;
    }
  }
  if (count === 0) return [0, 0, 0, 0];
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count), Math.round(a / count)];
}

function fillBlock(
  ctx: CanvasRenderingContext2D,
  color: RgbaTuple,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number,
  darken = 0,
) {
  const [r, g, b, a] = color;
  if (a <= 0 || opacity <= 0) return;
  const shade = clamp(1 - darken, 0, 1);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)},${clamp((a / 255) * opacity, 0, 1)})`;
  ctx.fillRect(x, y, w, h);
}

interface BadStreamFlags {
  macroFill: boolean;
  detailBlocks: boolean;
  blockSmear: boolean;
  chromaBlocks: boolean;
  blockDropout: boolean;
}

interface BadStreamConfig {
  amount: number;
  macroSize: number;
  detail: number;
  smear: number;
  chroma: number;
  darkness: number;
  macroStride: number;
  detailStride: number;
  flags: BadStreamFlags;
}

interface BadStreamState {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  source: Uint8ClampedArray;
  snapshot: HTMLCanvasElement;
  rng: () => number;
  cfg: BadStreamConfig;
}

interface BlockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function resolveBadStreamConfig(params: KernelParamValues, scale: number): BadStreamConfig | null {
  const amount = clamp(params.badStream, 0, 100) / 100;
  if (amount <= 0) return null;

  const macroSize = Math.max(4, Math.round(clamp(params.badStreamBlockSize, 4, 240) * scale));
  const detailSize = Math.max(3, Math.round(macroSize * 0.22));
  const detail = clamp(params.badStreamDetail, 0, 100) / 100;
  const smear = clamp(params.badStreamSmear, 0, 100) / 100;
  const chroma = clamp(params.badStreamChroma, 0, 100) / 100;
  const darkness = clamp(params.badStreamDarkness, 0, 100) / 100;
  const macroStride = Math.max(1, Math.floor(macroSize / 8));
  const detailStride = Math.max(1, Math.floor(detailSize / 3));
  const stages = params.badStreamStages;
  const isAllInOne = stages === 'all';
  const drawMacroFill = isAllInOne || stages === 'macroblocks';
  const drawDetailBlocks = isAllInOne || stages === 'detailBlocks' || stages === 'chromaBlocks';
  const drawBlockSmear = isAllInOne || stages === 'blockSmear';
  const drawChromaBlocks = isAllInOne || stages === 'chromaBlocks';
  const drawBlockDropout = isAllInOne || stages === 'blockDropout';

  return {
    amount,
    macroSize,
    detail,
    smear,
    chroma,
    darkness,
    macroStride,
    detailStride,
    flags: {
      macroFill: drawMacroFill,
      detailBlocks: drawDetailBlocks,
      blockSmear: drawBlockSmear,
      chromaBlocks: drawChromaBlocks,
      blockDropout: drawBlockDropout,
    },
  };
}

function drawBadStreamMacroSmear(state: BadStreamState, rect: BlockRect) {
  const { ctx, W, H, snapshot, rng, cfg } = state;
  if (!cfg.flags.blockSmear || cfg.smear <= 0 || rng() >= cfg.smear * 0.65) return;
  const maxDx = Math.round(cfg.macroSize * (0.35 + cfg.amount * 0.9) * (rng() < 0.5 ? -1 : 1));
  const maxDy = Math.round(cfg.macroSize * 0.16 * (rng() - 0.5));
  const sx = clamp(rect.x + maxDx, 0, Math.max(0, W - rect.w));
  const sy = clamp(rect.y + maxDy, 0, Math.max(0, H - rect.h));
  ctx.globalAlpha = cfg.amount * cfg.smear * (0.18 + rng() * 0.42);
  ctx.drawImage(snapshot, sx, sy, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
}

function drawBadStreamMacroFill(state: BadStreamState, rect: BlockRect, color: RgbaTuple) {
  const { ctx, rng, cfg } = state;
  if (!cfg.flags.macroFill) return;
  fillBlock(
    ctx,
    color,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    0.28 + cfg.amount * 0.55 + rng() * 0.08,
    cfg.darkness * (0.18 + rng() * 0.28),
  );
}

function drawBadStreamMacroChroma(state: BadStreamState, rect: BlockRect, color: RgbaTuple) {
  const { ctx, rng, cfg } = state;
  if (!cfg.flags.chromaBlocks || cfg.chroma <= 0 || rng() >= cfg.chroma * 0.58) return;
  const shift = (rng() < 0.5 ? -1 : 1) * (18 + cfg.chroma * 44);
  const chromaColor: RgbaTuple = [
    clamp(color[0] + shift, 0, 255),
    clamp(color[1] + shift * 0.18, 0, 255),
    clamp(color[2] - shift, 0, 255),
    color[3],
  ];
  fillBlock(ctx, chromaColor, rect.x, rect.y, rect.w, rect.h, cfg.amount * cfg.chroma * 0.46, 0);
}

function drawBadStreamMacroDropout(state: BadStreamState, rect: BlockRect) {
  const { ctx, rng, cfg } = state;
  if (!cfg.flags.blockDropout || cfg.darkness <= 0 || rng() >= cfg.amount * cfg.darkness * 0.14) return;
  ctx.fillStyle = `rgba(0,0,0,${0.18 + cfg.darkness * 0.48})`;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function applyBadStreamMacroPass(state: BadStreamState) {
  const { W, H, source, rng, cfg } = state;
  for (let y = 0; y < H; y += cfg.macroSize) {
    for (let x = 0; x < W; x += cfg.macroSize) {
      const rect = { x, y, w: Math.min(cfg.macroSize, W - x), h: Math.min(cfg.macroSize, H - y) };
      if (rng() > 0.32 + cfg.amount * 0.68) continue;

      drawBadStreamMacroSmear(state, rect);
      const color = averageBlockColor(source, W, H, x, y, rect.w, rect.h, cfg.macroStride);
      drawBadStreamMacroFill(state, rect, color);
      drawBadStreamMacroChroma(state, rect, color);
      drawBadStreamMacroDropout(state, rect);
    }
  }
}

function badStreamDetailRect(state: BadStreamState, x: number, y: number, cellSize: number): BlockRect {
  const { W, H } = state;
  return { x, y, w: Math.min(cellSize, W - x), h: Math.min(cellSize, H - y) };
}

function badStreamDetailSample(state: BadStreamState, rect: BlockRect): { sx: number; sy: number; color: RgbaTuple } {
  const { W, H, source, rng, cfg } = state;
  const jitterX = Math.round((rng() - 0.5) * cfg.macroSize * cfg.detail * 0.35);
  const jitterY = Math.round((rng() - 0.5) * cfg.macroSize * cfg.detail * 0.16);
  const sx = clamp(rect.x + jitterX, 0, Math.max(0, W - rect.w));
  const sy = clamp(rect.y + jitterY, 0, Math.max(0, H - rect.h));
  const [r, g, b, a] = averageBlockColor(source, W, H, sx, sy, rect.w, rect.h, cfg.detailStride);
  const quantizeStep = 18 + Math.round(cfg.detail * 54);
  const toneShift = (rng() - 0.5) * (16 + cfg.detail * 58);
  return {
    sx,
    sy,
    color: [
      clamp(Math.round((r + toneShift) / quantizeStep) * quantizeStep, 0, 255),
      clamp(Math.round((g + toneShift) / quantizeStep) * quantizeStep, 0, 255),
      clamp(Math.round((b + toneShift) / quantizeStep) * quantizeStep, 0, 255),
      a,
    ],
  };
}

function drawBadStreamDetailEdges(state: BadStreamState, rect: BlockRect) {
  const { ctx, rng, cfg } = state;
  if (cfg.detail <= 0.28 || rng() >= cfg.detail * 0.7) return;
  const edgeAlpha = cfg.detail * cfg.amount * 0.16;
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(0,0,0,${edgeAlpha})`;
  ctx.fillRect(rect.x, rect.y, rect.w, 1);
  ctx.fillRect(rect.x, rect.y, 1, rect.h);
  if (rng() < cfg.chroma * 0.45) {
    ctx.fillStyle = `rgba(220,235,255,${edgeAlpha * 0.75})`;
    ctx.fillRect(rect.x + rect.w - 1, rect.y, 1, rect.h);
  }
}

function drawBadStreamDetailSmear(state: BadStreamState, rect: BlockRect, sx: number, sy: number) {
  const { ctx, snapshot, rng, cfg } = state;
  if (!cfg.flags.blockSmear || cfg.smear <= 0 || rng() >= cfg.detail * cfg.smear * 0.18) return;
  ctx.globalAlpha = cfg.amount * cfg.detail * cfg.smear * 0.22;
  ctx.drawImage(snapshot, sx, sy, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
}

function drawBadStreamDetailDropout(state: BadStreamState, rect: BlockRect): boolean {
  const { ctx, rng, cfg } = state;
  if (!cfg.flags.blockDropout || rng() >= cfg.detail * cfg.amount * cfg.darkness * 0.08) return false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(0,0,0,${0.12 + cfg.darkness * 0.32})`;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  return true;
}

function drawBadStreamDetailChroma(state: BadStreamState, rect: BlockRect) {
  const { ctx, rng, cfg } = state;
  if (!cfg.flags.chromaBlocks || rng() >= cfg.detail * cfg.amount * cfg.chroma * 0.12) return;
  ctx.globalAlpha = 1;
  ctx.fillStyle =
    rng() < 0.5 ? `rgba(210,225,255,${0.1 + cfg.chroma * 0.2})` : `rgba(255,120,210,${0.08 + cfg.chroma * 0.18})`;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function drawBadStreamDetailCell(state: BadStreamState, rect: BlockRect) {
  const { ctx, rng, cfg } = state;
  const { sx, sy, color } = badStreamDetailSample(state, rect);
  const detailOpacity = clamp(0.28 + cfg.detail * 0.44 + cfg.amount * 0.18, 0, 0.95);
  fillBlock(ctx, color, rect.x, rect.y, rect.w, rect.h, detailOpacity, cfg.darkness * (0.1 + rng() * 0.28));
  drawBadStreamDetailEdges(state, rect);
  drawBadStreamDetailSmear(state, rect, sx, sy);
  if (!drawBadStreamDetailDropout(state, rect)) drawBadStreamDetailChroma(state, rect);
}

function applyBadStreamDetailPass(state: BadStreamState, scale: number) {
  const { W, H, rng, cfg } = state;
  if (!cfg.flags.detailBlocks || cfg.detail <= 0) return;
  const detailCellSize = Math.max(3, Math.round(clamp(cfg.macroSize * 0.16, 5 * scale, 16 * scale)));
  const detailChance = clamp(0.16 + cfg.detail * 0.68 + cfg.amount * 0.2, 0, 0.96);
  for (let y = 0; y < H; y += detailCellSize) {
    for (let x = 0; x < W; x += detailCellSize) {
      if (rng() > detailChance) continue;
      drawBadStreamDetailCell(state, badStreamDetailRect(state, x, y, detailCellSize));
    }
  }
}

function applyBadStreamChromaDrift(state: BadStreamState) {
  const { ctx, W, H, snapshot, cfg } = state;
  if (!cfg.flags.chromaBlocks || cfg.chroma <= 0) return;
  const drift = Math.max(1, Math.round(cfg.macroSize * (0.08 + cfg.chroma * 0.16)));
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = cfg.amount * cfg.chroma * 0.16;
  ctx.drawImage(snapshot, drift, 0, W - drift, H, 0, 0, W - drift, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = cfg.amount * cfg.chroma * 0.1;
  ctx.drawImage(snapshot, 0, 0, W - drift, H, drift, 0, W - drift, H);
}

function applyBadStreamDarkness(ctx: CanvasRenderingContext2D, W: number, H: number, cfg: BadStreamConfig) {
  if (cfg.darkness <= 0) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = cfg.amount * cfg.darkness * 0.42;
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);
}

export function applyBadStreamEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: KernelParamValues,
  seed: number,
  scale: number,
) {
  const cfg = resolveBadStreamConfig(params, scale);
  if (!cfg) return;

  const state: BadStreamState = {
    ctx,
    W,
    H,
    source: ctx.getImageData(0, 0, W, H).data,
    snapshot: cloneCanvas(ctx.canvas, W, H),
    rng: lcg(seed ^ 0xbad570),
    cfg,
  };

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  applyBadStreamMacroPass(state);
  applyBadStreamDetailPass(state, scale);
  applyBadStreamChromaDrift(state);
  applyBadStreamDarkness(ctx, W, H, cfg);
  ctx.restore();
}
