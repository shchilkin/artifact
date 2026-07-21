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
import { DEFAULT_EFFECT_LAYER_PROPS } from '../../../types/config';
import { ensureCanvasFontLoaded, getCanvasFontStack } from '../../fontLoading';
import { lcg } from '../../lcg';
import { measurePerformancePhase } from '../../performanceMeasure';
import type { MaterialTextureCanvases, ResolvedMaterialConfig } from '../../primitiveScene';
import { drawSourceLayer } from '../../proceduralSource';
import { cloneCanvas, createCanvas, maskCanvasToAlpha, REF, toCompositeOperation } from '../canvas';
import type { EffectPixelTransformOp } from '../workers/effectPixelTransform';
import { renderEffectPixelTransforms } from '../workers/effectPixelTransformClient';
import { applyDotGrain, applyEmboss, applyGrain, applyLinocut, applyMatte, applyScanlines } from './textureEffects';

const LAYER_RENDER_MEASURE_PREFIX = 'artifact:layer-render';

type GpuRenderToCanvas = typeof import('../../gpuRender').gpuRenderToCanvas;
type BuildFiltersFromEffectLayer = typeof import('../../pixiFilters').buildFiltersFromEffectLayer;

let gpuModulesPromise: Promise<{
  gpuRenderToCanvas: GpuRenderToCanvas;
  buildFiltersFromEffectLayer: BuildFiltersFromEffectLayer;
}> | null = null;

function loadGpuModules() {
  gpuModulesPromise ??= Promise.all([import('../../gpuRender'), import('../../pixiFilters')]).then(
    ([gpuRender, pixiFilters]) => ({
      gpuRenderToCanvas: gpuRender.gpuRenderToCanvas,
      buildFiltersFromEffectLayer: pixiFilters.buildFiltersFromEffectLayer,
    }),
  );
  return gpuModulesPromise;
}

export interface RenderOptions {
  /** Skip GPU effect passes during e.g. drag interactions for instant feedback. Canvas 2D effects and masking still apply. */
  skipEffects?: boolean;
  /** Use lighter-weight source rendering while interactive controls are moving, then settle back to full quality. */
  draft?: boolean;
  /** Choose whether to render via saved node graph or plain ordered layer stack. */
  graphMode?: 'auto' | 'graph' | 'stack';
  /** Export/output nodes stay transparent in graph mode; stack mode asks them to paint the document background. */
  outputBackground?: 'transparent' | 'document';
  /** Optional live primitive viewport overrides so node/output/export renders can match the interactive 3D preview. */
  primitiveViewStates?: Record<string, PrimitiveViewportState>;
  /** Optional resolved primitive material overrides from graph material nodes. */
  primitiveMaterials?: Record<string, ResolvedMaterialConfig>;
  /** Optional resolved texture-map canvases for graph-driven primitive materials. */
  primitiveMaterialTextures?: Record<string, MaterialTextureCanvases>;
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

function getLayerMeasureName(layer: Layer) {
  const label = layer.kind === 'effect' ? `effect:${layer.preset}` : layer.kind;
  return `${LAYER_RENDER_MEASURE_PREFIX}:${label}`;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function parseHexRgb(value: unknown, fallback: string): [number, number, number] {
  const hex = typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : fallback;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

async function measureLayerRender<T>(layer: Layer, task: () => Promise<T>) {
  const measureName = getLayerMeasureName(layer);
  return measurePerformancePhase(measureName, task, layer.id);
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
  const fontStack = getCanvasFontStack(layer.font);

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

function resolveBadStreamConfig(layer: EffectLayer, scale: number): BadStreamConfig | null {
  const amount = clamp(layer.badStream, 0, 100) / 100;
  if (amount <= 0) return null;

  const macroSize = Math.max(4, Math.round(clamp(layer.badStreamBlockSize, 4, 240) * scale));
  const detailSize = Math.max(3, Math.round(macroSize * 0.22));
  const detail = clamp(layer.badStreamDetail, 0, 100) / 100;
  const smear = clamp(layer.badStreamSmear, 0, 100) / 100;
  const chroma = clamp(layer.badStreamChroma, 0, 100) / 100;
  const darkness = clamp(layer.badStreamDarkness, 0, 100) / 100;
  const macroStride = Math.max(1, Math.floor(macroSize / 8));
  const detailStride = Math.max(1, Math.floor(detailSize / 3));
  const preset = layer.preset;
  const isAllInOne = preset === 'badStream' || preset === undefined;
  const drawMacroFill = isAllInOne || preset === 'macroblocks';
  const drawDetailBlocks = isAllInOne || preset === 'detailBlocks' || preset === 'chromaBlocks';
  const drawBlockSmear = isAllInOne || preset === 'blockSmear';
  const drawChromaBlocks = isAllInOne || preset === 'chromaBlocks';
  const drawBlockDropout = isAllInOne || preset === 'blockDropout';

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

function applyBadStreamEffect(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  seed: number,
  scale: number,
) {
  const cfg = resolveBadStreamConfig(layer, scale);
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

async function applyCanvas2DEffects(
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

async function runGpuPass(
  current: HTMLCanvasElement,
  W: number,
  H: number,
  filters: Filter[],
): Promise<HTMLCanvasElement> {
  const { gpuRenderToCanvas } = await loadGpuModules();
  return gpuRenderToCanvas({ width: W, height: H, source: current, filters });
}

const CANVAS_POSITIVE_EFFECT_KEYS: Array<keyof EffectLayer> = [
  'glitch',
  'badStream',
  'rgbSplit',
  'retroResolution',
  'scanlines',
  'grain',
  'dotGrain',
  'tintOp',
  'sepia',
  'infrared',
  'ca',
  'dither',
  'indexedPalette',
  'gradientMap',
  'channelMixer',
  'edgeCrush',
  'silhouetteCrush',
  'pixelStretch',
  'bokehBlur',
  'hatching',
  'vhsTracking',
  'matte',
  'waveAmt',
  'zoomBlur',
  'neonGlow',
  'overprint',
  'solarize',
  'bleachBypass',
  'cyanotype',
  'splitToneAmt',
  'rippleAmt',
  'patternRefraction',
  'kaleidoscope',
  'emboss',
  'linocut',
  'fog',
  'gooeyMerge',
  'speedLines',
];
const CANVAS_NONZERO_EFFECT_KEYS: Array<keyof EffectLayer> = ['squeezeX', 'squeezeY'];
const GPU_POSITIVE_EFFECT_KEYS: Array<keyof EffectLayer> = [
  'mirror',
  'dataMosh',
  'interlace',
  'noiseWarp',
  'morphAmt',
  'vortex',
  'barrel',
  'tearAmt',
  'pixelate',
  'posterize',
  'hueShift',
  'duotone',
  'halftone',
  'risoShift',
  'bloom',
  'blurAmt',
  'threshold',
  'edgeDetect',
  'gradMix',
  'vignette',
  'filmBurn',
];

function numericEffectValue(layer: EffectLayer, key: keyof EffectLayer) {
  return Number(layer[key] ?? 0);
}

function hasAnyPositiveEffectValue(layer: EffectLayer, keys: Array<keyof EffectLayer>) {
  return keys.some((key) => numericEffectValue(layer, key) > 0);
}

function hasAnyNonZeroEffectValue(layer: EffectLayer, keys: Array<keyof EffectLayer>) {
  return keys.some((key) => numericEffectValue(layer, key) !== 0);
}

function hasRayEffect(layer: EffectLayer) {
  return layer.rayInt > 0 && layer.rays > 0;
}

function hasCanvas2DEffect(layer: EffectLayer): boolean {
  return (
    hasRayEffect(layer) ||
    hasAnyPositiveEffectValue(layer, CANVAS_POSITIVE_EFFECT_KEYS) ||
    hasAnyNonZeroEffectValue(layer, CANVAS_NONZERO_EFFECT_KEYS)
  );
}

function hasGpuEffect(layer: EffectLayer): boolean {
  return hasAnyPositiveEffectValue(layer, GPU_POSITIVE_EFFECT_KEYS);
}

export function isGpuOnlyEffectLayer(layer: EffectLayer): boolean {
  return layer.visible && !layer.maskAlpha && hasGpuEffect(layer) && !hasCanvas2DEffect(layer);
}

export async function applyGpuOnlyEffectLayerChain(
  base: HTMLCanvasElement,
  layers: EffectLayer[],
  doc: CanvasDocument,
  W: number,
  H: number,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  if (options.skipEffects || layers.length === 0) return base;
  const { buildFiltersFromEffectLayer } = await loadGpuModules();
  const filters: Filter[] = [];
  for (const layer of layers) {
    throwIfRenderAborted(options);
    const effectSeed = doc.global.seed + (layer.seedOffset ?? 0);
    const nextFilters = buildFiltersFromEffectLayer(layer, effectSeed, W, H);
    if (nextFilters?.length) filters.push(...nextFilters);
  }
  if (filters.length === 0) return base;
  return runGpuPass(cloneCanvas(base, W, H), W, H, filters);
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
  return applyLayerToCanvasProfiled(base, layer, doc, W, H, imageCache, options, true);
}

type LayerRenderContext<T extends Layer = Layer> = {
  base: HTMLCanvasElement;
  current: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  layer: T;
  doc: CanvasDocument;
  W: number;
  H: number;
  imageCache: Map<string, HTMLImageElement>;
  options: RenderOptions;
  seed: number;
  scale: number;
};

type EffectRenderDimensions = {
  width: number;
  height: number;
};

function createLayerRenderContext(
  base: HTMLCanvasElement,
  layer: Layer,
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
): LayerRenderContext {
  const current = cloneCanvas(base, W, H);
  const ctx = current.getContext('2d', { willReadFrequently: true })!;
  return {
    base,
    current,
    ctx,
    layer,
    doc,
    W,
    H,
    imageCache,
    options,
    seed: doc.global.seed,
    scale: W / REF,
  };
}

async function renderEmojiLayerToCanvas(context: LayerRenderContext<EmojiLayer>) {
  const { ctx, W, H, layer, seed, scale, current } = context;
  drawEmojiLayer(ctx, W, H, layer, lcg((seed + (layer.seedOffset ?? 0)) ^ 0x7a8b9c), scale);
  return current;
}

async function renderTextLayerToCanvas(context: LayerRenderContext<TextLayer>) {
  const { ctx, W, H, layer, scale, current } = context;
  await ensureCanvasFontLoaded(layer.font, layer.size * scale);
  drawTextLayer(ctx, W, H, layer, scale);
  return current;
}

function renderImageLayerToCanvas(context: LayerRenderContext<ImageLayer>) {
  const { ctx, W, H, layer, imageCache, current } = context;
  drawImageLayer(ctx, W, H, layer, imageCache.get(layer.src) ?? null);
  return current;
}

function renderFillLayerToCanvas(context: LayerRenderContext<FillLayer>) {
  const { ctx, W, H, layer, current } = context;
  drawFillLayer(ctx, W, H, layer);
  return current;
}

function sourceLayerLayout(layer: Layer, options: RenderOptions) {
  return layer.kind === 'primitive' || layer.kind === 'lineField' || layer.kind === 'model'
    ? 'full-frame'
    : (options.sourceLayout ?? 'document');
}

async function renderSourceLayerToCanvas(context: LayerRenderContext<Layer>) {
  const { ctx, W, H, layer, seed, scale, options, current } = context;
  await drawSourceLayer(
    ctx,
    W,
    H,
    layer,
    seed,
    scale,
    options.draft ?? false,
    layer.kind === 'primitive' || layer.kind === 'model' ? options.primitiveViewStates?.[layer.id] : undefined,
    layer.kind === 'primitive' ? options.primitiveMaterials?.[layer.id] : undefined,
    layer.kind === 'primitive' ? options.primitiveMaterialTextures?.[layer.id] : undefined,
    sourceLayerLayout(layer, options),
  );
  return current;
}

function effectRenderDimensions(
  W: number,
  H: number,
  effectResolution: RenderOptions['effectResolution'],
): EffectRenderDimensions | null {
  if (!effectResolution) return null;
  const width = Math.min(W, Math.max(1, Math.round(effectResolution.width)));
  const height = Math.min(H, Math.max(1, Math.round(effectResolution.height)));
  return width === W && height === H ? null : { width, height };
}

async function renderEffectAtResolution(
  context: LayerRenderContext<EffectLayer>,
  dimensions: EffectRenderDimensions,
): Promise<HTMLCanvasElement> {
  const { base, layer, doc, imageCache, options, W, H } = context;
  const effectBase = createCanvas(dimensions.width, dimensions.height);
  const effectCtx = effectBase.getContext('2d', { willReadFrequently: true })!;
  effectCtx.drawImage(base, 0, 0, dimensions.width, dimensions.height);
  const renderedEffect = await applyLayerToCanvasProfiled(
    effectBase,
    layer,
    doc,
    dimensions.width,
    dimensions.height,
    imageCache,
    { ...options, effectResolution: undefined },
    false,
  );
  throwIfRenderAborted(options);
  const scaled = createCanvas(W, H);
  const scaledCtx = scaled.getContext('2d', { willReadFrequently: true })!;
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(renderedEffect, 0, 0, W, H);
  return scaled;
}

async function maybeRenderEffectAtResolution(context: LayerRenderContext<EffectLayer>) {
  const dimensions = effectRenderDimensions(context.W, context.H, context.options.effectResolution);
  return dimensions ? renderEffectAtResolution(context, dimensions) : null;
}

async function applyGpuFiltersForEffect(
  current: HTMLCanvasElement,
  context: LayerRenderContext<EffectLayer>,
  effectSeed: number,
) {
  const { layer, W, H, options } = context;
  if (options.skipEffects) return current;
  const { buildFiltersFromEffectLayer } = await loadGpuModules();
  const filters = buildFiltersFromEffectLayer(layer, effectSeed, W, H);
  if (!filters?.length) return current;
  const next = await runGpuPass(current, W, H, filters);
  throwIfRenderAborted(options);
  return next;
}

async function renderEffectLayerToCanvas(context: LayerRenderContext<EffectLayer>) {
  const { base, ctx, W, H, layer, seed, scale, options } = context;
  throwIfRenderAborted(options);
  if (options.skipEffects) return base;
  const scaledEffect = await maybeRenderEffectAtResolution(context);
  if (scaledEffect) return scaledEffect;

  const alphaMask = layer.maskAlpha ? cloneCanvas(base, W, H) : null;
  const effectSeed = seed + (layer.seedOffset ?? 0);
  await applyCanvas2DEffects(ctx, W, H, layer, effectSeed, scale, lcg(effectSeed ^ 0x1a2b3c));
  throwIfRenderAborted(options);
  let current = await applyGpuFiltersForEffect(context.current, context, effectSeed);
  if (alphaMask) current = maskCanvasToAlpha(current, alphaMask, W, H);
  return current;
}

const LAYER_RENDERERS = {
  emoji: renderEmojiLayerToCanvas,
  text: renderTextLayerToCanvas,
  image: renderImageLayerToCanvas,
  fill: renderFillLayerToCanvas,
  primitive: renderSourceLayerToCanvas,
  noise: renderSourceLayerToCanvas,
  array: renderSourceLayerToCanvas,
  lineField: renderSourceLayerToCanvas,
  model: renderSourceLayerToCanvas,
};

function layerRenderer(kind: Layer['kind']) {
  return LAYER_RENDERERS[kind as keyof typeof LAYER_RENDERERS] ?? null;
}

async function renderVisibleLayerToCanvas(
  base: HTMLCanvasElement,
  layer: Layer,
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
) {
  const context = createLayerRenderContext(base, layer, doc, W, H, imageCache, options);
  const renderLayer = layerRenderer(layer.kind);
  if (renderLayer) return renderLayer(context as never);
  return renderEffectLayerToCanvas({ ...context, layer: layer as EffectLayer });
}

async function applyLayerToCanvasProfiled(
  base: HTMLCanvasElement,
  layer: Layer,
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
  shouldMeasure: boolean,
): Promise<HTMLCanvasElement> {
  throwIfRenderAborted(options);
  if (!layer.visible) return base;
  if (shouldMeasure) {
    return measureLayerRender(layer, () =>
      applyLayerToCanvasProfiled(base, layer, doc, W, H, imageCache, options, false),
    );
  }

  const current = await renderVisibleLayerToCanvas(base, layer, doc, W, H, imageCache, options);
  throwIfRenderAborted(options);
  return current;
}
