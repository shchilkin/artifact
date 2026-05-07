import type {
  CanvasDocument,
  EffectLayer,
  EmojiLayer,
  FillLayer,
  GeneratorConfig,
  ImageLayer,
  TextLayer,
} from '../types/config';
import { lcg } from './lcg';
import { buildFiltersFromEffectLayer } from './pixiFilters';
import { gpuRenderToCanvas } from './gpuRender';
import { migrateFromV1 } from '../types/config';
import type { Filter, Renderer } from 'pixi.js';

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

function toCompositeOperation(blendMode: string): GlobalCompositeOperation {
  return (blendMode === 'normal' ? 'source-over' : blendMode) as GlobalCompositeOperation;
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string) {
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

  if (layer.ca > 0) {
    const ca = Math.round(layer.ca * scale);
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const ri = (y * W + Math.min(W - 1, x + ca)) * 4;
        const bi = (y * W + Math.max(0, x - ca)) * 4;
        data[i] = copy[ri];
        data[i + 2] = copy[bi + 2];
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
}

function render2DLayerStack(
  doc: CanvasDocument,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  scaleMultiplier = 1,
) {
  const scale = (W / REF) * scaleMultiplier;
  const seed = doc.global.seed;
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawBackground(ctx, W, H, doc.global.bg);

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (layer.kind === 'emoji') {
      drawEmojiLayer(ctx, W, H, layer, lcg(seed ^ 0x7a8b9c), scale);
    } else if (layer.kind === 'text') {
      drawTextLayer(ctx, W, H, layer, scale);
    } else if (layer.kind === 'image') {
      drawImageLayer(ctx, W, H, layer, imageCache.get(layer.src) ?? null);
    } else if (layer.kind === 'effect') {
      applyCanvas2DEffects(ctx, W, H, layer, seed, scale, lcg(seed ^ 0x1a2b3c));
    }
  }
}

async function runGpuPass(
  current: HTMLCanvasElement,
  W: number,
  H: number,
  filters: Filter[],
  persistentRenderer?: Renderer,
): Promise<HTMLCanvasElement> {
  if (!persistentRenderer) {
    return gpuRenderToCanvas({ width: W, height: H, source: current, filters });
  }

  const { Container, RenderTexture, Sprite, Texture } = await import('pixi.js');
  const canvasTex = Texture.from(current);
  const gpuTex = RenderTexture.create({ width: W, height: H });
  try {
    const blitSprite = new Sprite(canvasTex);
    blitSprite.width = W;
    blitSprite.height = H;
    canvasTex.update();
    persistentRenderer.render(blitSprite, { renderTexture: gpuTex, clear: true });
    const displaySprite = new Sprite(gpuTex);
    displaySprite.width = W;
    displaySprite.height = H;
    displaySprite.filters = filters;
    const stage = new Container();
    stage.addChild(displaySprite);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return persistentRenderer.plugins.extract.canvas(stage) as HTMLCanvasElement;
  } finally {
    canvasTex.destroy(true);
    gpuTex.destroy(true);
  }
}

export async function renderDocument(
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  persistentRenderer?: Renderer,
): Promise<HTMLCanvasElement> {
  const scale = W / REF;
  const seed = doc.global.seed;
  let current = createCanvas(W, H);
  let ctx = current.getContext('2d', { willReadFrequently: true })!;
  drawBackground(ctx, W, H, doc.global.bg);

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (layer.kind === 'emoji') {
      drawEmojiLayer(ctx, W, H, layer, lcg(seed ^ 0x7a8b9c), scale);
    } else if (layer.kind === 'text') {
      drawTextLayer(ctx, W, H, layer, scale);
    } else if (layer.kind === 'image') {
      drawImageLayer(ctx, W, H, layer, imageCache.get(layer.src) ?? null);
    } else if (layer.kind === 'fill') {
      drawFillLayer(ctx, W, H, layer);
    } else if (layer.kind === 'effect') {
      applyCanvas2DEffects(ctx, W, H, layer, seed, scale, lcg(seed ^ 0x1a2b3c));
      const filters = buildFiltersFromEffectLayer(layer, seed, W, H);
      if (filters?.length) {
        current = await runGpuPass(current, W, H, filters, persistentRenderer);
        ctx = current.getContext('2d', { willReadFrequently: true })!;
      }
    }
  }

  return current;
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
  const doc = migrateFromV1(seed, cfg);
  if (bgImage) {
    doc.layers.unshift({
      id: 'legacy-bg-image',
      name: 'Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: '__legacy_bg__',
      fit: cfg.bgImageFit ?? 'cover',
      opacity: cfg.bgImageOpacity ?? 85,
      blendMode: cfg.bgImageBlend ?? 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
  }
  const imageCache = new Map<string, HTMLImageElement>();
  if (bgImage) imageCache.set('__legacy_bg__', bgImage);
  render2DLayerStack(doc, ctx, W, H, imageCache, scaleMultiplier);
}
