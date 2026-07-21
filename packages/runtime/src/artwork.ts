import {
  type PreparedArtifactRuntimeProject,
  prepareArtifactRuntimeProject,
  releasePreparedArtifactRuntimeProject,
  renderPreparedArtifactRuntimeProject,
} from './document.js';
import { retainArtifactGpuResources } from './gpu.js';
import {
  analyzeMixedMediaMotionRecipe,
  applyEvaluatedMotion,
  evaluateMixedMediaMotion,
  normalizeMixedMediaChoreographyTime,
} from './motion.js';
import type {
  ArtifactRuntimeCapabilityReport,
  CreateMixedMediaArtworkOptions,
  MixedMediaArtworkFrameDiagnostics,
  MixedMediaArtworkSession,
  MixedMediaMotionRecipe,
  MixedMediaRecipeCompatibilityReport,
} from './types.js';

const DEFAULT_MAX_RENDER_SIZE = 512;

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function positiveDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function fitDimensions(width: number, height: number, pixelRatio: number, maxSize: number) {
  const targetWidth = positiveDimension(width) * pixelRatio;
  const targetHeight = positiveDimension(height) * pixelRatio;
  const ratio = Math.min(1, maxSize / Math.max(targetWidth, targetHeight));
  return {
    width: Math.max(1, Math.round(targetWidth * ratio)),
    height: Math.max(1, Math.round(targetHeight * ratio)),
  };
}

export class MixedMediaRecipeCompatibilityError extends Error {
  readonly capabilityReport: ArtifactRuntimeCapabilityReport;
  readonly report: MixedMediaRecipeCompatibilityReport;

  constructor(report: MixedMediaRecipeCompatibilityReport, capabilityReport: ArtifactRuntimeCapabilityReport) {
    super(`Artifact Runtime rejected the Motion Recipe: ${report.issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'MixedMediaRecipeCompatibilityError';
    this.capabilityReport = capabilityReport;
    this.report = report;
  }
}

class DocumentBackedMixedMediaArtworkSession implements MixedMediaArtworkSession {
  readonly capabilityReport;
  readonly compatibilityReport;
  #canvas: HTMLCanvasElement;
  #currentTime = 0;
  #destroyed = false;
  #dimensions: { width: number; height: number };
  #frameRequest: number | null = null;
  #isRunning = false;
  #maxRenderSize: number;
  #onFrame?: (diagnostics: MixedMediaArtworkFrameDiagnostics) => void;
  #onRenderError?: (error: unknown) => void;
  #pixelRatio: number;
  #prepared: PreparedArtifactRuntimeProject;
  #prefixCache: { entries: Map<string, HTMLCanvasElement>; maxEntries: number; throughLayerId: string } | undefined;
  #recipe: MixedMediaMotionRecipe;
  #releaseGpu: () => void;
  #renderQueue: Promise<void> = Promise.resolve();
  #renderRevision = 0;
  #startedAt = 0;

  constructor(
    options: CreateMixedMediaArtworkOptions,
    prepared: PreparedArtifactRuntimeProject,
    compatibilityReport: MixedMediaRecipeCompatibilityReport,
  ) {
    this.#canvas = options.canvas;
    this.#prepared = prepared;
    this.#recipe = options.motionRecipe;
    this.#pixelRatio = options.pixelRatio ?? (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    this.#maxRenderSize = options.maxRenderSize ?? DEFAULT_MAX_RENDER_SIZE;
    this.#dimensions = fitDimensions(
      options.canvas.clientWidth || options.canvas.width || DEFAULT_MAX_RENDER_SIZE,
      options.canvas.clientHeight || options.canvas.height || DEFAULT_MAX_RENDER_SIZE,
      this.#pixelRatio,
      this.#maxRenderSize,
    );
    this.#onFrame = options.onFrame;
    this.#onRenderError = options.onRenderError;
    this.capabilityReport = prepared.report;
    this.compatibilityReport = compatibilityReport;
    const orderedLayerIds = prepared.orderedLayerIds;
    const firstContinuousIndex = options.motionRecipe.tracks.reduce((lowest, track) => {
      if (track.stepFps !== undefined) return lowest;
      const index = orderedLayerIds.indexOf(track.target.layerId);
      return index >= 0 ? Math.min(lowest, index) : lowest;
    }, orderedLayerIds.length);
    const cacheThroughLayerId =
      options.motionRecipe.tracks.length > 0 ? orderedLayerIds[firstContinuousIndex - 1] : undefined;
    this.#prefixCache = cacheThroughLayerId
      ? { entries: new Map(), maxEntries: 24, throughLayerId: cacheThroughLayerId }
      : undefined;
    this.#releaseGpu = retainArtifactGpuResources();
  }

  get currentTime() {
    return this.#currentTime;
  }

  get isRunning() {
    return this.#isRunning;
  }

  async initialize() {
    await this.#requestRender(0);
  }

  start() {
    if (this.#destroyed || this.#isRunning) return;
    this.#isRunning = true;
    this.#startedAt = now() - this.#currentTime * 1000;
    this.#frameRequest = requestAnimationFrame(this.#tick);
  }

  pause() {
    if (!this.#isRunning) return;
    this.#isRunning = false;
    if (this.#frameRequest !== null) cancelAnimationFrame(this.#frameRequest);
    this.#frameRequest = null;
  }

  async seek(timeSeconds: number) {
    if (this.#destroyed || !Number.isFinite(timeSeconds)) return;
    this.#currentTime = normalizeMixedMediaChoreographyTime(this.#recipe, timeSeconds);
    if (this.#isRunning) this.#startedAt = now() - this.#currentTime * 1000;
    await this.#requestRender(this.#currentTime);
  }

  async resize(width: number, height: number) {
    if (this.#destroyed || width <= 0 || height <= 0) return;
    this.#dimensions = fitDimensions(width, height, this.#pixelRatio, this.#maxRenderSize);
    await this.#requestRender(this.#currentTime);
  }

  destroy() {
    this.#dispose(true);
  }

  abortInitialization() {
    this.#dispose(false);
  }

  #dispose(clearHostCanvas: boolean) {
    if (this.#destroyed) return;
    this.pause();
    this.#destroyed = true;
    this.#renderRevision += 1;
    if (clearHostCanvas) {
      this.#canvas.width = 1;
      this.#canvas.height = 1;
    }
    this.#prefixCache?.entries.clear();
    void this.#renderQueue.finally(() => {
      releasePreparedArtifactRuntimeProject(this.#prepared);
      this.#releaseGpu();
    });
  }

  #tick = (timestamp: number) => {
    if (!this.#isRunning || this.#destroyed) return;
    const elapsed = Math.max(0, (timestamp - this.#startedAt) / 1000);
    this.#currentTime = normalizeMixedMediaChoreographyTime(this.#recipe, elapsed);
    void this.#requestRender(this.#currentTime).catch((error: unknown) => this.#onRenderError?.(error));
    if (this.#recipe.timeline.mode === 'once' && elapsed >= this.#recipe.timeline.durationSeconds) {
      this.pause();
      return;
    }
    this.#frameRequest = requestAnimationFrame(this.#tick);
  };

  #requestRender(choreographyTime: number) {
    const revision = ++this.#renderRevision;
    const render = async () => {
      if (this.#destroyed || revision !== this.#renderRevision) return;
      const evaluated = evaluateMixedMediaMotion(this.#recipe, choreographyTime);
      const layers = applyEvaluatedMotion(this.#prepared.project.document.layers, evaluated);
      const startedAt = now();
      await renderPreparedArtifactRuntimeProject({
        canvas: this.#canvas,
        height: this.#dimensions.height,
        layers,
        prepared: this.#prepared,
        prefixCache: this.#prefixCache,
        // Commit the newest complete frame even if a later request arrived while
        // it was rendering. Pending work is coalesced before it starts; rejecting
        // every in-flight frame on a slow composition would starve the host canvas.
        shouldCommit: () => !this.#destroyed,
        width: this.#dimensions.width,
      });
      if (!this.#destroyed) {
        this.#onFrame?.({
          choreographyTime,
          renderDurationMs: now() - startedAt,
          ...this.#dimensions,
        });
      }
    };
    const next = this.#renderQueue.then(render, render);
    this.#renderQueue = next.catch(() => undefined);
    return next;
  }
}

export async function createMixedMediaArtwork(
  options: CreateMixedMediaArtworkOptions,
): Promise<MixedMediaArtworkSession> {
  if (options.profile !== 'mixed-media-2d@1') {
    throw new Error(`Artifact Runtime does not support Runtime Profile ${String(options.profile)}.`);
  }
  const prepared = await prepareArtifactRuntimeProject(options.composition, { fontFamilies: options.fontFamilies });
  const compatibilityReport = analyzeMixedMediaMotionRecipe(prepared.project, options.motionRecipe, {
    compositionSha256: options.compositionSha256,
  });
  if (!compatibilityReport.compatible) {
    releasePreparedArtifactRuntimeProject(prepared);
    throw new MixedMediaRecipeCompatibilityError(compatibilityReport, prepared.report);
  }
  const session = new DocumentBackedMixedMediaArtworkSession(options, prepared, compatibilityReport);
  try {
    await session.initialize();
    return session;
  } catch (error) {
    session.abortInitialization();
    throw error;
  }
}
