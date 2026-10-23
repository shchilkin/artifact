import type { Filter } from 'pixi.js';
import type { PrimitiveViewportState } from '../../../components/PrimitiveViewportState';
import type {
  CanvasDocument,
  EffectLayer,
  EmojiLayer,
  FillLayer,
  ImageLayer,
  Layer,
  SourceLayer,
  TextLayer,
} from '../../../types/config';
import { EFFECT_IDS, effectDefinition, effectsWithBackend, isEffectActive } from '../../../types/effectSchema';
import { ensureCanvasFontLoaded } from '../../fontLoading';
import { lcg } from '../../lcg';
import { measurePerformancePhase } from '../../performanceMeasure';
import type { MaterialTextureCanvases, ResolvedMaterialConfig } from '../../primitiveScene';
import { drawSourceLayer } from '../../proceduralSource';
import { cloneCanvas, createCanvas, maskCanvasToAlpha, REF, toCompositeOperation } from '../canvas';
import { applyCanvas2DEffects } from './canvasEffects';
import { drawEmojiLayer, drawFillLayer, drawImageLayer, drawTextLayer } from './drawLayers';

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
  /**
   * Interactive previews only: an effect layer's GPU filters run in the same GPU pass as the GPU-only effect layers
   * right after it, saving one canvas upload and readback. Translucent pixels can differ from separate passes by
   * readback rounding, so full-quality, thumbnail, and export renders leave this off.
   */
  mergeGpuPasses?: boolean;
  /** Layer preview only: its GPU passes feed the device's GPU cost estimate, which sizes interactive frames. */
  recordGpuCost?: boolean;
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

async function measureLayerRender<T>(layer: Layer, task: () => Promise<T>) {
  const measureName = getLayerMeasureName(layer);
  return measurePerformancePhase(measureName, task, layer.id);
}

/** The seed an effect layer's Canvas 2D effects and GPU filters draw from. */
function effectLayerSeed(documentSeed: number, layer: EffectLayer) {
  return documentSeed + (layer.seedOffset ?? 0);
}

/**
 * An effect layer's Canvas 2D effects, shared by separate and merged GPU passes so both draw the same pixels.
 * Returns the layer's seed for its GPU filters.
 */
async function applyEffectLayerCanvas2DEffects(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layer: EffectLayer,
  documentSeed: number,
  scale: number,
) {
  const effectSeed = effectLayerSeed(documentSeed, layer);
  await applyCanvas2DEffects(ctx, W, H, layer, effectSeed, scale, lcg(effectSeed ^ 0x1a2b3c));
  return effectSeed;
}

async function runGpuPass(
  current: HTMLCanvasElement,
  W: number,
  H: number,
  filters: Filter[],
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  const { gpuRenderToCanvas } = await loadGpuModules();
  return gpuRenderToCanvas({ width: W, height: H, source: current, filters, recordCost: options.recordGpuCost });
}

const CANVAS_PASS_EFFECTS = EFFECT_IDS.filter((effect) => effectDefinition(effect).backend !== 'gpu');
const GPU_PASS_EFFECTS = effectsWithBackend('gpu');

/** Amount keys of effects owned by the Canvas 2D pass (main thread or pixel worker). The GPU filter builder must not handle them. */
export const CANVAS_EFFECT_AMOUNT_KEYS = CANVAS_PASS_EFFECTS.flatMap((effect) => effectDefinition(effect).amounts);

function hasCanvas2DEffect(layer: EffectLayer): boolean {
  return CANVAS_PASS_EFFECTS.some((effect) => isEffectActive(layer, effect));
}

function hasGpuEffect(layer: EffectLayer): boolean {
  return GPU_PASS_EFFECTS.some((effect) => isEffectActive(layer, effect));
}

export function isGpuOnlyEffectLayer(layer: EffectLayer): boolean {
  return (
    layer.visible && !layer.maskAlpha && !hasEffectBlendMode(layer) && hasGpuEffect(layer) && !hasCanvas2DEffect(layer)
  );
}

/**
 * An effect layer whose GPU filters (if any) can run after its Canvas 2D effects in a later, shared GPU pass: its
 * output is not masked or blended over its input, so nothing needs the pixels between the two parts.
 */
export function canMergeTrailingGpuPass(layer: EffectLayer): boolean {
  return layer.visible && !layer.maskAlpha && !hasEffectBlendMode(layer);
}

function hasEffectBlendMode(layer: EffectLayer): boolean {
  return (layer.blendMode ?? 'normal') !== 'normal';
}

/** Composites the effected result over the untouched input using the layer's blend mode. */
function blendEffectOverBase(
  base: HTMLCanvasElement,
  effected: HTMLCanvasElement,
  layer: EffectLayer,
  W: number,
  H: number,
): HTMLCanvasElement {
  if (!hasEffectBlendMode(layer) || effected === base) return effected;
  const blended = cloneCanvas(base, W, H);
  const ctx = blended.getContext('2d')!;
  ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode ?? 'normal');
  ctx.drawImage(effected, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  return blended;
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
    const nextFilters = buildFiltersFromEffectLayer(layer, effectLayerSeed(doc.global.seed, layer), W, H);
    if (nextFilters?.length) filters.push(...nextFilters);
  }
  if (filters.length === 0) return base;
  return runGpuPass(cloneCanvas(base, W, H), W, H, filters, options);
}

/** The Canvas 2D part of an effect layer whose GPU filters run later, in a merged GPU pass. */
export async function applyEffectLayerCanvas2DPass(
  base: HTMLCanvasElement,
  layer: EffectLayer,
  doc: CanvasDocument,
  W: number,
  H: number,
  imageCache: Map<string, HTMLImageElement>,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  return measureLayerRender(layer, async () => {
    throwIfRenderAborted(options);
    const { ctx, current, seed, scale } = createLayerRenderContext(base, layer, doc, W, H, imageCache, options);
    await applyEffectLayerCanvas2DEffects(ctx, W, H, layer, seed, scale);
    throwIfRenderAborted(options);
    return current;
  });
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

async function renderSourceLayerToCanvas(context: LayerRenderContext<SourceLayer>) {
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
  const next = await runGpuPass(current, W, H, filters, options);
  throwIfRenderAborted(options);
  return next;
}

async function renderEffectLayerToCanvas(context: LayerRenderContext<EffectLayer>) {
  const { base, layer, W, H } = context;
  const effected = await renderEffectPass(context);
  return blendEffectOverBase(base, effected, layer, W, H);
}

async function renderEffectPass(context: LayerRenderContext<EffectLayer>) {
  const { base, ctx, W, H, layer, seed, scale, options } = context;
  throwIfRenderAborted(options);
  if (options.skipEffects) return base;
  const scaledEffect = await maybeRenderEffectAtResolution(context);
  if (scaledEffect) return scaledEffect;

  const alphaMask = layer.maskAlpha ? cloneCanvas(base, W, H) : null;
  const effectSeed = await applyEffectLayerCanvas2DEffects(ctx, W, H, layer, seed, scale);
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
