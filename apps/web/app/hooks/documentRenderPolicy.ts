/** Live preview render policy: interactive scale, draft windows, frame cache, blank-frame detection, and timeouts. */
import { type MutableRefObject } from 'react';
import type { CanvasDocument } from '../types/config';
import { type RenderOptions } from '../utils/renderer';

export const DRAFT_SETTLE_MS = 120;

export const DEFAULT_DEFERRED_FULL_RENDER_MS = 1800;

export const DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS = 3200;

const BLANK_SAMPLE_STEPS = 9;

const RENDER_TIMEOUT_MS = 1400;

const RENDER_CACHE_LIMIT = 6;

/** Interactive pass sizes, as fractions of the draft size. Few steps keep the layer prefix cache useful. */
const INTERACTIVE_SCALE_STEPS = [1, 0.75, 0.5] as const;

/** A larger interactive size is chosen again only once a pass there is expected to fit well within the budget. */
const INTERACTIVE_SCALE_UP_HEADROOM = 0.7;

export const INTERACTIVE_WARMUP_IDLE_TIMEOUT_MS = 300;

export type InteractiveScale = (typeof INTERACTIVE_SCALE_STEPS)[number];

export interface Options {
  /** While true, renderer skips GPU effect passes for fast pointer feedback. */
  fast?: boolean;
  /** 3D primitive/model/scene camera overrides used by node previews and export. */
  primitiveViewStates?: RenderOptions['primitiveViewStates'];
  /** Keeps the last good preview visible across component remounts. */
  cacheKey?: string;
  /** Render above CSS display resolution, then downsample in the browser. */
  renderScale?: number;
  /** Upper bound for the largest internal render dimension. */
  maxRenderDimension?: number;
  /** Optional lower render scale for immediate preview / fast frames. */
  draftRenderScale?: number;
  /** Optional lower max dimension for immediate preview / fast frames. */
  draftMaxRenderDimension?: number;
  /** Draw a quick lower-resolution preview first, then wait for an idle slot before full quality. */
  deferFullRender?: boolean;
  /** Whether the immediate low-resolution pass should also simplify sources and skip effects. */
  deferredPreviewQuality?: 'draft' | 'full';
  /** Delay before the deferred full-quality pass is allowed to start. */
  deferredFullRenderMs?: number;
  /** requestIdleCallback timeout for the deferred full-quality pass. */
  deferredFullRenderTimeoutMs?: number;
  /**
   * Longest expected GPU effect pass at the interactive size. On a slower GPU (such as software WebGL) the
   * interactive pass renders smaller, down to half the draft size, to stay within it; the full-quality pass is
   * unaffected.
   */
  interactiveGpuPassBudgetMs?: number;
}

export interface DocumentRenderState {
  isRendering: boolean;
  hasFrame: boolean;
  showingStaleFrame: boolean;
  error: Error | null;
}

export type RenderCanvasMountOptions = Pick<
  Options,
  'cacheKey' | 'deferFullRender' | 'renderScale' | 'maxRenderDimension' | 'deferredFullRenderTimeoutMs'
>;

export const lastGoodRenderCache = new Map<string, HTMLCanvasElement>();

export function makeRenderCacheKey(cacheKey: string | undefined, pw: number, ph: number): string | null {
  return cacheKey ? `${cacheKey}:${pw}x${ph}` : null;
}

/**
 * The largest interactive scale whose expected GPU pass time fits the budget, given an estimate of one pass's time
 * for a pixel count and the pixel count of the draft size. Without a budget or an estimate the current scale stays.
 */
export function chooseInteractiveScale(
  current: InteractiveScale,
  estimatePassMs: (pixels: number) => number | null,
  draftPixels: number,
  budgetMs: number | undefined,
): InteractiveScale {
  if (budgetMs === undefined || estimatePassMs(draftPixels) === null) return current;
  for (const scale of INTERACTIVE_SCALE_STEPS) {
    const limit = scale > current ? budgetMs * INTERACTIVE_SCALE_UP_HEADROOM : budgetMs;
    if ((estimatePassMs(draftPixels * scale * scale) ?? 0) <= limit) return scale;
  }
  return INTERACTIVE_SCALE_STEPS[INTERACTIVE_SCALE_STEPS.length - 1];
}

export function getRenderDimensions(
  pw: number,
  ph: number,
  renderScale = 1,
  maxRenderDimension = Number.POSITIVE_INFINITY,
): [number, number] {
  const safeScale = Number.isFinite(renderScale) ? Math.max(1, renderScale) : 1;
  const largest = Math.max(pw, ph, 1);
  const boundedScale = Math.min(safeScale, maxRenderDimension / largest);
  return [Math.max(1, Math.round(pw * boundedScale)), Math.max(1, Math.round(ph * boundedScale))];
}

export function rememberRenderFrame(cacheKey: string | null, canvas: HTMLCanvasElement): void {
  if (!cacheKey) return;

  const clone = document.createElement('canvas');
  clone.width = canvas.width;
  clone.height = canvas.height;
  clone.getContext('2d')?.drawImage(canvas, 0, 0);

  lastGoodRenderCache.delete(cacheKey);
  lastGoodRenderCache.set(cacheKey, clone);

  while (lastGoodRenderCache.size > RENDER_CACHE_LIMIT) {
    const oldestKey = lastGoodRenderCache.keys().next().value;
    if (!oldestKey) break;
    lastGoodRenderCache.delete(oldestKey);
  }
}

export function shouldDeferFullRender(options: Options) {
  return Boolean(options.deferFullRender && !(options.fast ?? false));
}

export function nextDraftWindowMs(options: Options, deferFullRender: boolean) {
  return deferFullRender
    ? (options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS)
    : DRAFT_SETTLE_MS;
}

export function shouldRefreshDraftWindow(
  lastGoodCanvas: HTMLCanvasElement | null,
  options: Options,
  deferFullRender: boolean,
) {
  return !lastGoodCanvas || (options.fast ?? false) || deferFullRender;
}

export function clearRenderTimer(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = null;
}

function hasVisibleContentLayer(doc: CanvasDocument): boolean {
  return doc.layers.some((layer) => {
    if (!layer.visible) return false;
    if (layer.kind === 'effect') return false;
    if (layer.kind === 'image') return layer.src.length > 0;
    if (layer.kind === 'text') return layer.content.trim().length > 0;
    if (layer.kind === 'emoji') return layer.emojis.length > 0 && layer.density > 0 && layer.opacity > 0;
    return layer.opacity > 0;
  });
}

export function isLikelyBlankRender(canvas: HTMLCanvasElement, doc: CanvasDocument): boolean {
  if (!hasVisibleContentLayer(doc)) return false;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return true;

  let minChannel = 255;
  let maxChannel = 0;
  let alphaTotal = 0;
  let luminanceTotal = 0;
  let samples = 0;

  const pixels = ctx.getImageData(0, 0, width, height).data;
  for (let yStep = 0; yStep < BLANK_SAMPLE_STEPS; yStep += 1) {
    for (let xStep = 0; xStep < BLANK_SAMPLE_STEPS; xStep += 1) {
      const x = Math.min(width - 1, Math.round((xStep / (BLANK_SAMPLE_STEPS - 1)) * (width - 1)));
      const y = Math.min(height - 1, Math.round((yStep / (BLANK_SAMPLE_STEPS - 1)) * (height - 1)));
      const index = (y * width + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const a = pixels[index + 3] ?? 0;
      minChannel = Math.min(minChannel, r, g, b);
      maxChannel = Math.max(maxChannel, r, g, b);
      alphaTotal += a;
      luminanceTotal += 0.299 * r + 0.587 * g + 0.114 * b;
      samples += 1;
    }
  }

  const averageAlpha = alphaTotal / samples;
  const averageLuminance = luminanceTotal / samples;
  return averageAlpha < 4 || (averageLuminance < 18 && maxChannel < 56);
}

export function withRenderTimeout(
  promise: Promise<HTMLCanvasElement>,
  timeoutMs = RENDER_TIMEOUT_MS,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Canvas render timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
