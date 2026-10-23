/** One live preview render cycle: render, mount, fall back, and schedule warmup. `useDocumentRenderer` drives it. */
import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CanvasDocument } from '../types/config';
import { estimateGpuPassMs } from '../utils/gpuPassCost';
import { scheduleIdle } from '../utils/idleCallback';
import { createLayerPreviewRenderCache } from '../utils/layerPreviewRenderCache';
import { isLayerStackGraph } from '../utils/nodeGraph';
import { type RenderOptions, renderDocument } from '../utils/renderer';
import {
  chooseInteractiveScale,
  type DocumentRenderState,
  getRenderDimensions,
  INTERACTIVE_WARMUP_IDLE_TIMEOUT_MS,
  type InteractiveScale,
  isAbortError,
  isLikelyBlankRender,
  lastGoodRenderCache,
  makeRenderCacheKey,
  nextDraftWindowMs,
  type RenderCanvasMountOptions,
  rememberRenderFrame,
  withRenderTimeout,
} from './documentRenderPolicy';

type RenderStateSetter = Dispatch<SetStateAction<DocumentRenderState>>;

export interface DocumentRendererRefs {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  renderingRef: MutableRefObject<boolean>;
  /** A newer request superseded the running render: drop its result instead of painting it. */
  supersededRef: MutableRefObject<boolean>;
  /** The running render is an interactive preview-size pass rather than a full-quality one. */
  interactiveRenderRef: MutableRefObject<boolean>;
  activeAbortRef: MutableRefObject<AbortController | null>;
  layerGraphCacheEntriesRef: MutableRefObject<Map<string, Promise<HTMLCanvasElement>>>;
  lastGoodCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  docRef: MutableRefObject<CanvasDocument>;
  imageCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  pwRef: MutableRefObject<number>;
  phRef: MutableRefObject<number>;
  renderWidthRef: MutableRefObject<number>;
  renderHeightRef: MutableRefObject<number>;
  fastRef: MutableRefObject<boolean>;
  primitiveViewStatesRef: MutableRefObject<RenderOptions['primitiveViewStates']>;
  cacheKeyRef: MutableRefObject<string | null>;
  draftRenderScaleRef: MutableRefObject<number | undefined>;
  draftMaxRenderDimensionRef: MutableRefObject<number | undefined>;
  deferredPreviewQualityRef: MutableRefObject<'draft' | 'full'>;
  draftUntilRef: MutableRefObject<number>;
  gpuFallbackUntilRef: MutableRefObject<number>;
  interactiveGpuPassBudgetMsRef: MutableRefObject<number | undefined>;
  interactiveScaleRef: MutableRefObject<InteractiveScale>;
  /** Size of the last completed interactive pass: the layer prefix cache holds that size. */
  warmInteractiveSizeRef: MutableRefObject<string | null>;
  /** The scheduled or running unpainted render that fills the prefix cache at a new interactive size. */
  warmupRef: MutableRefObject<{ cancelIdle: (() => void) | null; abort: AbortController | null }>;
}

export function markRenderStarted(setRenderState: RenderStateSetter) {
  setRenderState((state) => ({
    isRendering: true,
    hasFrame: state.hasFrame,
    showingStaleFrame: state.hasFrame,
    error: null,
  }));
}

function renderFailureError(error: unknown) {
  return error instanceof Error ? error : new Error('Canvas render failed.');
}

function setRenderFailure(error: unknown, setRenderState: RenderStateSetter) {
  setRenderState((state) => ({
    isRendering: false,
    hasFrame: state.hasFrame,
    showingStaleFrame: state.hasFrame,
    error: renderFailureError(error),
  }));
}

function drawRenderResult(result: HTMLCanvasElement, refs: DocumentRendererRefs, setRenderState: RenderStateSetter) {
  const displayCanvas = refs.canvasRef.current;
  if (!displayCanvas) return;
  // The display canvas takes the frame's own size and CSS scales it to the preview box. Scaling a small
  // interactive frame up into a full-resolution canvas would cost a full-resolution raster per paint.
  if (displayCanvas.width !== result.width || displayCanvas.height !== result.height) {
    displayCanvas.width = result.width;
    displayCanvas.height = result.height;
  }
  const ctx = displayCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
  ctx.drawImage(result, 0, 0);
  refs.lastGoodCanvasRef.current = result;
  if (result.width === refs.renderWidthRef.current && result.height === refs.renderHeightRef.current) {
    rememberRenderFrame(refs.cacheKeyRef.current, result);
  }
  // Interactive frames usually leave the state as it was; keeping the same object skips a React commit per frame.
  setRenderState((state) =>
    !state.isRendering && state.hasFrame && !state.showingStaleFrame && !state.error
      ? state
      : { isRendering: false, hasFrame: true, showingStaleFrame: false, error: null },
  );
}

export function finishRenderCycle(
  refs: DocumentRendererRefs,
  abortController: AbortController,
  done: (options: { cooldown: boolean }) => void,
) {
  refs.renderingRef.current = false;
  if (refs.activeAbortRef.current === abortController) refs.activeAbortRef.current = null;
  // Only interactive passes are part of a gesture; a full-quality pass must not delay the next edit.
  done({ cooldown: refs.interactiveRenderRef.current });
}

function renderCacheForMode(refs: DocumentRendererRefs, renderOptions: RenderOptions, width: number, height: number) {
  // A layer-stack graph renders each layer on top of the layers below it, so per-layer prefix entries stay valid.
  return isLayerStackGraph(refs.docRef.current)
    ? createLayerPreviewRenderCache(
        refs.docRef.current,
        refs.imageCacheRef.current,
        refs.layerGraphCacheEntriesRef.current,
        {
          width,
          height,
          renderOptions,
        },
      )
    : undefined;
}

function renderDocumentFrame(refs: DocumentRendererRefs, width: number, height: number, renderOptions: RenderOptions) {
  return renderDocument(
    refs.docRef.current,
    width,
    height,
    refs.imageCacheRef.current,
    renderOptions,
    renderCacheForMode(refs, renderOptions, width, height),
  );
}

function renderDraftFallback(refs: DocumentRendererRefs, baseOptions: RenderOptions) {
  const fallbackOptions: RenderOptions = {
    ...baseOptions,
    skipEffects: true,
    draft: true,
  };
  const [fallbackWidth, fallbackHeight] = getRenderDimensions(
    refs.pwRef.current,
    refs.phRef.current,
    refs.draftRenderScaleRef.current,
    refs.draftMaxRenderDimensionRef.current,
  );
  return withRenderTimeout(renderDocumentFrame(refs, fallbackWidth, fallbackHeight, fallbackOptions));
}

/** Interactive pass size: the draft size, scaled down while the GPU is too slow for it. */
function interactiveRenderDimensions(refs: DocumentRendererRefs): [number, number] {
  const [width, height] = getRenderDimensions(
    refs.pwRef.current,
    refs.phRef.current,
    refs.draftRenderScaleRef.current,
    refs.draftMaxRenderDimensionRef.current,
  );
  const scale = chooseInteractiveScale(
    refs.interactiveScaleRef.current,
    estimateGpuPassMs,
    width * height,
    refs.interactiveGpuPassBudgetMsRef.current,
  );
  refs.interactiveScaleRef.current = scale;
  if (scale === 1) return [width, height];
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function frameRenderOptions(
  refs: DocumentRendererRefs,
  draftQuality: boolean,
  abortController: AbortController,
): RenderOptions {
  return {
    skipEffects: draftQuality,
    draft: draftQuality,
    recordGpuCost: true,
    primitiveViewStates: refs.primitiveViewStatesRef.current,
    signal: abortController.signal,
  };
}

export function currentRenderPolicy(refs: DocumentRendererRefs, abortController: AbortController) {
  const now = performance.now();
  const inDeferredPreviewWindow = now < refs.draftUntilRef.current;
  const inGpuFallbackWindow = now < refs.gpuFallbackUntilRef.current;
  const usePreviewSize = refs.fastRef.current || inDeferredPreviewWindow || inGpuFallbackWindow;
  const useDraftQuality =
    refs.fastRef.current ||
    inGpuFallbackWindow ||
    (inDeferredPreviewWindow && refs.deferredPreviewQualityRef.current === 'draft');
  const [targetWidth, targetHeight] = usePreviewSize
    ? interactiveRenderDimensions(refs)
    : [refs.renderWidthRef.current, refs.renderHeightRef.current];

  return {
    targetWidth,
    targetHeight,
    interactive: usePreviewSize,
    renderOptions: frameRenderOptions(refs, useDraftQuality, abortController),
  };
}

export function cancelInteractiveWarmup(refs: DocumentRendererRefs) {
  const warmup = refs.warmupRef.current;
  warmup.cancelIdle?.();
  warmup.abort?.abort();
  refs.warmupRef.current = { cancelIdle: null, abort: null };
}

/** Identifies a render size, for comparing the interactive size with the size the prefix cache holds. */
export function renderSizeKey(width: number, height: number) {
  return `${width}x${height}`;
}

/**
 * When the interactive pass changed size since it last ran, renders it once in idle time without painting, so the
 * layer prefix cache holds the new size and the next edit re-renders only the layers above it.
 */
export function scheduleInteractiveWarmup(refs: DocumentRendererRefs) {
  cancelInteractiveWarmup(refs);
  if (refs.interactiveGpuPassBudgetMsRef.current === undefined || !isLayerStackGraph(refs.docRef.current)) return;
  const cancelIdle = scheduleIdle(() => {
    refs.warmupRef.current.cancelIdle = null;
    if (!refs.canvasRef.current || refs.renderingRef.current) return;
    if (performance.now() < refs.gpuFallbackUntilRef.current) return;
    const [width, height] = interactiveRenderDimensions(refs);
    const size = renderSizeKey(width, height);
    if (size === refs.warmInteractiveSizeRef.current) return;
    const abortController = new AbortController();
    refs.warmupRef.current.abort = abortController;
    const draftQuality = refs.fastRef.current || refs.deferredPreviewQualityRef.current === 'draft';
    renderDocumentFrame(refs, width, height, frameRenderOptions(refs, draftQuality, abortController))
      .then(() => {
        if (!abortController.signal.aborted) refs.warmInteractiveSizeRef.current = size;
      })
      .catch(() => undefined)
      .finally(() => {
        if (refs.warmupRef.current.abort === abortController) refs.warmupRef.current.abort = null;
      });
  }, INTERACTIVE_WARMUP_IDLE_TIMEOUT_MS);
  refs.warmupRef.current = { cancelIdle, abort: null };
}

export function timedPrimaryRender(
  refs: DocumentRendererRefs,
  renderOptions: RenderOptions,
  width: number,
  height: number,
) {
  const primaryRender = renderDocumentFrame(refs, width, height, renderOptions);
  return renderOptions.skipEffects ? primaryRender : withRenderTimeout(primaryRender);
}

function createDisplayCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  return canvas;
}

function replaceMountedCanvas(container: HTMLDivElement, refs: DocumentRendererRefs) {
  if (refs.canvasRef.current && container.contains(refs.canvasRef.current)) {
    container.removeChild(refs.canvasRef.current);
  }
}

function restoreCachedFrame(
  canvas: HTMLCanvasElement,
  cachedFrame: HTMLCanvasElement | undefined,
  refs: DocumentRendererRefs,
  setRenderState: RenderStateSetter,
) {
  if (!cachedFrame) {
    refs.lastGoodCanvasRef.current = null;
    setRenderState({ isRendering: true, hasFrame: false, showingStaleFrame: false, error: null });
    return;
  }
  canvas.getContext('2d')?.drawImage(cachedFrame, 0, 0);
  refs.lastGoodCanvasRef.current = cachedFrame;
  setRenderState({ isRendering: true, hasFrame: true, showingStaleFrame: true, error: null });
}

function mountedDraftWindowUntil(cachedFrame: HTMLCanvasElement | undefined, options: RenderCanvasMountOptions) {
  if (cachedFrame && !options.deferFullRender) return 0;
  return performance.now() + nextDraftWindowMs(options, Boolean(options.deferFullRender));
}

export function mountRenderCanvas(
  container: HTMLDivElement,
  refs: DocumentRendererRefs,
  pw: number,
  ph: number,
  options: RenderCanvasMountOptions,
  setRenderState: RenderStateSetter,
) {
  replaceMountedCanvas(container, refs);
  const [renderWidth, renderHeight] = getRenderDimensions(pw, ph, options.renderScale, options.maxRenderDimension);
  refs.renderWidthRef.current = renderWidth;
  refs.renderHeightRef.current = renderHeight;
  const canvas = createDisplayCanvas(renderWidth, renderHeight);
  container.appendChild(canvas);
  refs.canvasRef.current = canvas;
  const currentCacheKey = makeRenderCacheKey(options.cacheKey, renderWidth, renderHeight);
  refs.cacheKeyRef.current = currentCacheKey;
  const cachedFrame = currentCacheKey ? lastGoodRenderCache.get(currentCacheKey) : undefined;
  restoreCachedFrame(canvas, cachedFrame, refs, setRenderState);
  refs.draftUntilRef.current = mountedDraftWindowUntil(cachedFrame, options);
  return canvas;
}

export function cleanupMountedRenderCanvas({
  container,
  canvas,
  refs,
  cancelScheduledRender,
  cancelDeferredFullRender,
}: {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  refs: DocumentRendererRefs;
  cancelScheduledRender: () => void;
  cancelDeferredFullRender: () => void;
}) {
  cancelDeferredFullRender();
  cancelScheduledRender();
  cancelInteractiveWarmup(refs);
  refs.activeAbortRef.current?.abort();
  refs.activeAbortRef.current = null;
  refs.canvasRef.current = null;
  if (container.contains(canvas)) container.removeChild(canvas);
}

function shouldUseBlankFallback(result: HTMLCanvasElement, refs: DocumentRendererRefs, renderOptions: RenderOptions) {
  return !refs.supersededRef.current && !renderOptions.skipEffects && isLikelyBlankRender(result, refs.docRef.current);
}

function handleBlankPrimaryRender({
  result,
  refs,
  renderOptions,
  abortController,
  setRenderState,
  finishRender,
}: {
  result: HTMLCanvasElement;
  refs: DocumentRendererRefs;
  renderOptions: RenderOptions;
  abortController: AbortController;
  setRenderState: RenderStateSetter;
  finishRender: () => void;
}) {
  refs.gpuFallbackUntilRef.current = performance.now() + 5000;
  renderDraftFallback(refs, renderOptions)
    .then((fallback) => {
      drawRenderResult(isLikelyBlankRender(fallback, refs.docRef.current) ? result : fallback, refs, setRenderState);
      if (import.meta.env.DEV) console.warn('Canvas render produced a blank frame; used draft fallback.');
    })
    .catch((fallbackError) => {
      if (isAbortError(fallbackError) || abortController.signal.aborted) return;
      drawRenderResult(result, refs, setRenderState);
    })
    .finally(finishRender);
}

export function handlePrimaryRenderSuccess(
  result: HTMLCanvasElement,
  refs: DocumentRendererRefs,
  renderOptions: RenderOptions,
  abortController: AbortController,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (shouldUseBlankFallback(result, refs, renderOptions)) {
    handleBlankPrimaryRender({ result, refs, renderOptions, abortController, setRenderState, finishRender });
    return;
  }
  if (!renderOptions.skipEffects) refs.gpuFallbackUntilRef.current = 0;
  if (!refs.supersededRef.current) drawRenderResult(result, refs, setRenderState);
  finishRender();
}

function handleDraftRenderFailure(
  error: unknown,
  refs: DocumentRendererRefs,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (refs.lastGoodCanvasRef.current) drawRenderResult(refs.lastGoodCanvasRef.current, refs, setRenderState);
  if (import.meta.env.DEV) console.warn('Canvas render failed.', error);
  setRenderFailure(error, setRenderState);
  finishRender();
}

function handleFallbackRenderFailure(
  fallbackError: unknown,
  refs: DocumentRendererRefs,
  abortController: AbortController,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (isAbortError(fallbackError) || abortController.signal.aborted) {
    finishRender();
    return;
  }
  if (!refs.supersededRef.current && refs.lastGoodCanvasRef.current) {
    drawRenderResult(refs.lastGoodCanvasRef.current, refs, setRenderState);
  }
  if (import.meta.env.DEV) console.warn('Canvas render failed.', fallbackError);
  setRenderFailure(fallbackError, setRenderState);
}

export function handlePrimaryRenderFailure(
  error: unknown,
  refs: DocumentRendererRefs,
  renderOptions: RenderOptions,
  abortController: AbortController,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (isAbortError(error) || abortController.signal.aborted) {
    finishRender();
    return;
  }
  if (refs.supersededRef.current) {
    if (!renderOptions.skipEffects) refs.gpuFallbackUntilRef.current = performance.now() + 5000;
    finishRender();
    return;
  }
  if (renderOptions.skipEffects) {
    handleDraftRenderFailure(error, refs, setRenderState, finishRender);
    return;
  }

  refs.gpuFallbackUntilRef.current = performance.now() + 5000;
  renderDraftFallback(refs, renderOptions)
    .then((fallback) => {
      if (!refs.supersededRef.current) drawRenderResult(fallback, refs, setRenderState);
      if (import.meta.env.DEV) console.warn('Canvas render fell back to draft mode.', error);
    })
    .catch((fallbackError) =>
      handleFallbackRenderFailure(fallbackError, refs, abortController, setRenderState, finishRender),
    )
    .finally(finishRender);
}
