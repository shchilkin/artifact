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
import { EXPORT_NODE_ID } from './nodeGraph';
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
    return persistentRenderer.extract.canvas(stage) as HTMLCanvasElement;
  } finally {
    canvasTex.destroy(true);
    gpuTex.destroy(true);
  }
}

async function applyLayerToCanvas(
  base: HTMLCanvasElement,
  layer: Layer,
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  persistentRenderer: Renderer | undefined,
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
    const filters = buildFiltersFromEffectLayer(layer, seed, W, H);
    if (filters?.length) {
      current = await runGpuPass(current, W, H, filters, persistentRenderer);
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

async function renderGraphNode(
  doc: CanvasDocument,
  graph: CanvasGraph,
  nodeId: string,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  persistentRenderer: Renderer | undefined,
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
        const rendered = await renderGraphNode(doc, graph, sourceId, W, H, imageCache, persistentRenderer, cache);
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
          await renderGraphNode(doc, graph, baseId, W, H, imageCache, persistentRenderer, cache),
          W,
          H,
        )
        : createCanvas(W, H);
      if (overlayId) {
        const overlay = await renderGraphNode(doc, graph, overlayId, W, H, imageCache, persistentRenderer, cache);
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
        ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, persistentRenderer, cache)
        : createCanvas(W, H);
      return applyColorNode(source, colorNode, W, H);
    }

    const layer = findLayer(doc, nodeId);
    if (!layer) return createCanvas(W, H);

    const inputPort = layer.kind === 'effect' ? 'in' : 'bg';
    const sourceId = findIncomingSource(graph, nodeId, inputPort);
    const base = sourceId
      ? await renderGraphNode(doc, graph, sourceId, W, H, imageCache, persistentRenderer, cache)
      : createCanvas(W, H);
    return applyLayerToCanvas(base, layer, doc, W, H, imageCache, persistentRenderer);
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
  persistentRenderer?: Renderer,
): Promise<HTMLCanvasElement> {
  return renderGraphNode(
    doc,
    graph,
    targetNodeId,
    W,
    H,
    imageCache,
    persistentRenderer,
    new Map<string, Promise<HTMLCanvasElement>>(),
  );
}

export async function renderDocument(
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  persistentRenderer?: Renderer,
): Promise<HTMLCanvasElement> {
  if (doc.graph) {
    return renderGraphTarget(doc, doc.graph, EXPORT_NODE_ID, W, H, imageCache, persistentRenderer);
  }

  let current = createCanvas(W, H);
  const ctx = current.getContext('2d', { willReadFrequently: true })!;
  drawBackground(ctx, W, H, doc.global.bg);

  const layers = doc.layers;
  for (const layer of layers) {
    current = await applyLayerToCanvas(current, layer, doc, W, H, imageCache, persistentRenderer);
  }
  return current;
}
