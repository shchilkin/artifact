import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { scheduleIdle } from '../utils/idleCallback';
import { PREVIEW_FRAME_INTERVAL_MS } from '../utils/interactionTiming';
import {
  cancelInteractiveWarmup,
  cleanupMountedRenderCanvas,
  currentRenderPolicy,
  type DocumentRendererRefs,
  finishRenderCycle,
  handlePrimaryRenderFailure,
  handlePrimaryRenderSuccess,
  markRenderStarted,
  mountRenderCanvas,
  renderSizeKey,
  scheduleInteractiveWarmup,
  timedPrimaryRender,
} from './documentRenderCycle';
import {
  clearRenderTimer,
  DEFAULT_DEFERRED_FULL_RENDER_MS,
  DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS,
  type DocumentRenderState,
  DRAFT_SETTLE_MS,
  getRenderDimensions,
  type InteractiveScale,
  makeRenderCacheKey,
  nextDraftWindowMs,
  type Options,
  type RenderCanvasMountOptions,
  shouldDeferFullRender,
  shouldRefreshDraftWindow,
} from './documentRenderPolicy';
import { createPreviewRenderScheduler, type PreviewRenderScheduler } from './previewRenderScheduler';

export {
  chooseInteractiveScale,
  getRenderDimensions,
  type InteractiveScale,
  isLikelyBlankRender,
} from './documentRenderPolicy';

export function useDocumentRenderer(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  pw: number,
  ph: number,
  options: Options = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderingRef = useRef(false);
  const supersededRef = useRef(false);
  const interactiveRenderRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);
  const layerGraphCacheEntriesRef = useRef(new Map<string, Promise<HTMLCanvasElement>>());
  const lastGoodCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef(doc);
  const imageCacheRef = useRef(imageCache);
  const pwRef = useRef(pw);
  const phRef = useRef(ph);
  const [initialRenderWidth, initialRenderHeight] = getRenderDimensions(
    pw,
    ph,
    options.renderScale,
    options.maxRenderDimension,
  );
  const renderWidthRef = useRef(initialRenderWidth);
  const renderHeightRef = useRef(initialRenderHeight);
  const fastRef = useRef(options.fast ?? false);
  const primitiveViewStatesRef = useRef(options.primitiveViewStates);
  const cacheKeyRef = useRef(makeRenderCacheKey(options.cacheKey, pw, ph));
  const draftRenderScaleRef = useRef(options.draftRenderScale ?? options.renderScale);
  const draftMaxRenderDimensionRef = useRef(options.draftMaxRenderDimension ?? options.maxRenderDimension);
  const deferredPreviewQualityRef = useRef(options.deferredPreviewQuality ?? 'draft');
  const deferredFullRenderMsRef = useRef(options.deferredFullRenderMs ?? DEFAULT_DEFERRED_FULL_RENDER_MS);
  const deferredFullRenderTimeoutMsRef = useRef(
    options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS,
  );
  const draftUntilRef = useRef(0);
  const gpuFallbackUntilRef = useRef(0);
  const interactiveGpuPassBudgetMsRef = useRef(options.interactiveGpuPassBudgetMs);
  const interactiveScaleRef = useRef<InteractiveScale>(1);
  const warmInteractiveSizeRef = useRef<string | null>(null);
  const warmupRef = useRef<DocumentRendererRefs['warmupRef']['current']>({ cancelIdle: null, abort: null });
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFullRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDeferredFullRenderIdleRef = useRef<(() => void) | null>(null);
  const [renderState, setRenderState] = useState<DocumentRenderState>({
    isRendering: false,
    hasFrame: false,
    showingStaleFrame: false,
    error: null,
  });
  // Stable bundle of the refs above; the literal is only used on the first render.
  const rendererRefsRef = useRef<DocumentRendererRefs>({
    canvasRef,
    renderingRef,
    supersededRef,
    interactiveRenderRef,
    activeAbortRef,
    layerGraphCacheEntriesRef,
    lastGoodCanvasRef,
    docRef,
    imageCacheRef,
    pwRef,
    phRef,
    renderWidthRef,
    renderHeightRef,
    fastRef,
    primitiveViewStatesRef,
    cacheKeyRef,
    draftRenderScaleRef,
    draftMaxRenderDimensionRef,
    deferredPreviewQualityRef,
    draftUntilRef,
    gpuFallbackUntilRef,
    interactiveGpuPassBudgetMsRef,
    interactiveScaleRef,
    warmInteractiveSizeRef,
    warmupRef,
  });
  const mountOptions: RenderCanvasMountOptions = useMemo(
    () => ({
      cacheKey: options.cacheKey,
      deferFullRender: options.deferFullRender,
      renderScale: options.renderScale,
      maxRenderDimension: options.maxRenderDimension,
      deferredFullRenderTimeoutMs: options.deferredFullRenderTimeoutMs,
    }),
    [
      options.cacheKey,
      options.deferFullRender,
      options.renderScale,
      options.maxRenderDimension,
      options.deferredFullRenderTimeoutMs,
    ],
  );
  const renderSchedulingOptions = useMemo(
    () => ({
      fast: options.fast,
      deferFullRender: options.deferFullRender,
      deferredFullRenderTimeoutMs: options.deferredFullRenderTimeoutMs,
    }),
    [options.fast, options.deferFullRender, options.deferredFullRenderTimeoutMs],
  );

  useEffect(() => {
    docRef.current = doc;
    imageCacheRef.current = imageCache;
    pwRef.current = pw;
    phRef.current = ph;
    [renderWidthRef.current, renderHeightRef.current] = getRenderDimensions(
      pw,
      ph,
      options.renderScale,
      options.maxRenderDimension,
    );
    fastRef.current = options.fast ?? false;
    primitiveViewStatesRef.current = options.primitiveViewStates;
    cacheKeyRef.current = makeRenderCacheKey(options.cacheKey, renderWidthRef.current, renderHeightRef.current);
    draftRenderScaleRef.current = options.draftRenderScale ?? options.renderScale;
    draftMaxRenderDimensionRef.current = options.draftMaxRenderDimension ?? options.maxRenderDimension;
    deferredPreviewQualityRef.current = options.deferredPreviewQuality ?? 'draft';
    deferredFullRenderMsRef.current = options.deferredFullRenderMs ?? DEFAULT_DEFERRED_FULL_RENDER_MS;
    deferredFullRenderTimeoutMsRef.current =
      options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS;
    interactiveGpuPassBudgetMsRef.current = options.interactiveGpuPassBudgetMs;
  }, [
    doc,
    imageCache,
    pw,
    ph,
    options.fast,
    options.primitiveViewStates,
    options.cacheKey,
    options.renderScale,
    options.maxRenderDimension,
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
    options.interactiveGpuPassBudgetMs,
  ]);

  const cancelDeferredFullRender = useCallback(() => {
    if (deferredFullRenderTimerRef.current) {
      clearTimeout(deferredFullRenderTimerRef.current);
      deferredFullRenderTimerRef.current = null;
    }
    cancelDeferredFullRenderIdleRef.current?.();
    cancelDeferredFullRenderIdleRef.current = null;
  }, []);

  const doRender = useCallback((done: (options: { cooldown: boolean }) => void) => {
    const rendererRefs = rendererRefsRef.current;
    if (!rendererRefs.canvasRef.current) {
      done({ cooldown: false });
      return;
    }

    rendererRefs.supersededRef.current = false;
    cancelInteractiveWarmup(rendererRefs);
    rendererRefs.activeAbortRef.current?.abort();
    const abortController = new AbortController();
    rendererRefs.activeAbortRef.current = abortController;
    const { targetWidth, targetHeight, interactive, renderOptions } = currentRenderPolicy(
      rendererRefs,
      abortController,
    );
    rendererRefs.interactiveRenderRef.current = interactive;
    const finishRender = () => {
      finishRenderCycle(rendererRefs, abortController, done);
    };

    rendererRefs.renderingRef.current = true;
    // While a frame is showing, interactive passes during an edit do not mark the preview busy: only a missing frame
    // or a full-quality pass does, so each interactive frame does not cost two extra React commits.
    if (!interactive || !rendererRefs.lastGoodCanvasRef.current) markRenderStarted(setRenderState);
    timedPrimaryRender(rendererRefs, renderOptions, targetWidth, targetHeight)
      .then((result) => {
        if (interactive) rendererRefs.warmInteractiveSizeRef.current = renderSizeKey(targetWidth, targetHeight);
        handlePrimaryRenderSuccess(result, rendererRefs, renderOptions, abortController, setRenderState, finishRender);
        if (!interactive && !rendererRefs.supersededRef.current) scheduleInteractiveWarmup(rendererRefs);
      })
      .catch((error) =>
        handlePrimaryRenderFailure(error, rendererRefs, renderOptions, abortController, setRenderState, finishRender),
      );
  }, []);

  // Latest-wins: one render in flight, at most one waiting, and free main-thread time between renders.
  const schedulerRef = useRef<PreviewRenderScheduler | null>(null);
  /**
   * Preview progress for the indicator: `data-preview-pending` on the render container is "true" from an edit until
   * the frame for the latest document, including its deferred full-quality pass, has painted. It is written to the
   * DOM outside React so interactive frames do not cost a commit each (see docs/state-model.md).
   */
  const syncPreviewPending = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const scheduler = schedulerRef.current;
    const pending =
      Boolean(scheduler?.running || scheduler?.pending) ||
      settleTimerRef.current !== null ||
      deferredFullRenderTimerRef.current !== null ||
      cancelDeferredFullRenderIdleRef.current !== null;
    const value = pending ? 'true' : 'false';
    if (container.dataset.previewPending !== value) container.dataset.previewPending = value;
  }, []);
  const scheduleRender = useCallback(() => {
    let scheduler = schedulerRef.current;
    if (!scheduler) {
      scheduler = createPreviewRenderScheduler({
        run: (done) =>
          doRender((options) => {
            done(options);
            syncPreviewPending();
          }),
        minIntervalMs: PREVIEW_FRAME_INTERVAL_MS,
        // A newer request aborts a running full-quality pass and drops its result. A running interactive pass is
        // allowed to finish and paint (one input behind): dropping it too left continuous drags on slow machines with
        // no preview frames at all (see docs/performance.md).
        onSupersede: () => {
          if (interactiveRenderRef.current) return;
          supersededRef.current = true;
          activeAbortRef.current?.abort();
        },
      });
      schedulerRef.current = scheduler;
    }
    scheduler.request();
    syncPreviewPending();
  }, [doRender, syncPreviewPending]);
  const cancelScheduledRender = useCallback(() => {
    schedulerRef.current?.cancelScheduled();
  }, []);

  const scheduleDeferredFullRender = useCallback(() => {
    cancelDeferredFullRender();
    const run = () => {
      deferredFullRenderTimerRef.current = null;
      cancelDeferredFullRenderIdleRef.current = null;
      draftUntilRef.current = 0;
      scheduleRender();
    };

    deferredFullRenderTimerRef.current = setTimeout(() => {
      deferredFullRenderTimerRef.current = null;
      cancelDeferredFullRenderIdleRef.current = scheduleIdle(run, deferredFullRenderTimeoutMsRef.current);
    }, deferredFullRenderMsRef.current);
  }, [cancelDeferredFullRender, scheduleRender]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const rendererRefs = rendererRefsRef.current;
    if (!container) return;
    const canvas = mountRenderCanvas(container, rendererRefs, pw, ph, mountOptions, setRenderState);
    scheduleRender();
    return () =>
      cleanupMountedRenderCanvas({
        container,
        canvas,
        refs: rendererRefs,
        cancelScheduledRender,
        cancelDeferredFullRender,
      });
  }, [
    pw,
    ph,
    options.cacheKey,
    options.renderScale,
    options.maxRenderDimension,
    options.deferFullRender,
    options.deferredFullRenderTimeoutMs,
    mountOptions,
    scheduleRender,
    cancelScheduledRender,
    cancelDeferredFullRender,
  ]);

  useEffect(() => {
    const deferFullRender = shouldDeferFullRender(renderSchedulingOptions);
    if (shouldRefreshDraftWindow(lastGoodCanvasRef.current, renderSchedulingOptions, deferFullRender)) {
      draftUntilRef.current = performance.now() + nextDraftWindowMs(renderSchedulingOptions, deferFullRender);
    }
    clearRenderTimer(settleTimerRef);
    cancelDeferredFullRender();
    scheduleRender();
    if (deferFullRender) {
      scheduleDeferredFullRender();
    } else {
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        draftUntilRef.current = 0;
        scheduleRender();
      }, DRAFT_SETTLE_MS + 16);
    }
    syncPreviewPending();
  }, [
    doc,
    imageCache,
    options.fast,
    options.primitiveViewStates,
    options.cacheKey,
    options.deferFullRender,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    renderSchedulingOptions,
    scheduleRender,
    cancelDeferredFullRender,
    scheduleDeferredFullRender,
    syncPreviewPending,
  ]);

  useEffect(
    () => () => {
      cancelScheduledRender();
      clearRenderTimer(settleTimerRef);
      cancelInteractiveWarmup(rendererRefsRef.current);
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      cancelDeferredFullRender();
    },
    [cancelDeferredFullRender, cancelScheduledRender],
  );

  return { containerRef, renderState, retryRender: scheduleRender };
}
