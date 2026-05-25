import type { Filter } from 'pixi.js';
import { Container, Renderer, RenderTexture, Sprite, Texture } from 'pixi.js';

interface GpuRenderOptions {
  width: number;
  height: number;
  source: HTMLCanvasElement;
  filters: Filter[];
}

export const GPU_RENDER_MEASURE = 'artifact:gpu-render';
export const GPU_QUEUE_WAIT_MEASURE = 'artifact:gpu-queue-wait';
export const GPU_UPLOAD_MEASURE = 'artifact:gpu-upload';
export const GPU_BLIT_MEASURE = 'artifact:gpu-blit';
export const GPU_FILTER_EXTRACT_MEASURE = 'artifact:gpu-filter-extract';

/**
 * One renderer per browser tab. Creating a Renderer = creating a WebGL context;
 * browsers cap concurrent contexts (~16) and start dropping the oldest. Sharing
 * one context across previews and thumbnails avoids exhausting that limit during
 * interactive edits.
 */
let sharedRenderer: Renderer | null = null;
let sharedRendererSize = { w: 0, h: 0 };
let gpuUnavailable = false;

function disposeShared() {
  if (sharedRenderer) {
    try {
      sharedRenderer.destroy(true);
    } catch {
      /* already gone */
    }
  }
  sharedRenderer = null;
  sharedRendererSize = { w: 0, h: 0 };
}

function getSharedRenderer(W: number, H: number): Renderer | null {
  if (gpuUnavailable) return null;
  try {
    if (!sharedRenderer) {
      sharedRenderer = new Renderer({ width: W, height: H, backgroundAlpha: 0, antialias: false });
      sharedRendererSize = { w: W, h: H };
      const canvas = sharedRenderer.view as HTMLCanvasElement;
      canvas.addEventListener?.('webglcontextlost', (e) => {
        e.preventDefault();
        disposeShared();
      });
    } else if (sharedRendererSize.w < W || sharedRendererSize.h < H) {
      sharedRenderer.resize(W, H);
      sharedRendererSize = { w: Math.max(sharedRendererSize.w, W), h: Math.max(sharedRendererSize.h, H) };
    }
    return sharedRenderer;
  } catch {
    disposeShared();
    gpuUnavailable = true;
    return null;
  }
}

function cloneSourceCanvas(source: HTMLCanvasElement, W: number, H: number): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = W;
  copy.height = H;
  copy.getContext('2d')!.drawImage(source, 0, 0, W, H);
  return copy;
}

/**
 * Serialize render calls — Pixi extracts a single backing canvas, so two
 * concurrent renders would race. The queue keeps work strictly sequential.
 */
let renderQueue: Promise<unknown> = Promise.resolve();

function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
  const queuedAt = now();
  const next = renderQueue.then(
    () => {
      measureDuration(GPU_QUEUE_WAIT_MEASURE, queuedAt, now());
      return fn();
    },
    () => {
      measureDuration(GPU_QUEUE_WAIT_MEASURE, queuedAt, now());
      return fn();
    },
  );
  renderQueue = next.catch(() => undefined);
  return next;
}

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function canMeasure() {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

function measureDuration(measureName: string, startTime: number, endTime: number) {
  if (!canMeasure()) return;
  const markId = `${measureName}:${Math.random().toString(36).slice(2)}`;
  const startMark = `${markId}:start`;
  const endMark = `${markId}:end`;
  try {
    performance.mark(startMark, { startTime });
    performance.mark(endMark, { startTime: endTime });
    performance.measure(measureName, startMark, endMark);
  } finally {
    performance.clearMarks?.(startMark);
    performance.clearMarks?.(endMark);
  }
}

async function measureGpuPhase<T>(measureName: string, task: () => Promise<T>) {
  if (!canMeasure()) return task();
  const startedAt = now();
  try {
    return await task();
  } finally {
    measureDuration(measureName, startedAt, now());
  }
}

function measureGpuPhaseSync<T>(measureName: string, task: () => T) {
  if (!canMeasure()) return task();
  const startedAt = now();
  try {
    return task();
  } finally {
    measureDuration(measureName, startedAt, now());
  }
}

async function renderWithRenderer(
  renderer: Renderer,
  W: number,
  H: number,
  source: HTMLCanvasElement,
  filters: Filter[],
): Promise<HTMLCanvasElement> {
  const canvasTex = measureGpuPhaseSync(GPU_UPLOAD_MEASURE, () => Texture.from(source));
  const gpuTex = RenderTexture.create({ width: W, height: H });
  const blitSprite = new Sprite(canvasTex);
  const displaySprite = new Sprite(gpuTex);
  const stage = new Container();

  try {
    blitSprite.width = W;
    blitSprite.height = H;

    measureGpuPhaseSync(GPU_BLIT_MEASURE, () => {
      canvasTex.update();
      renderer.render(blitSprite, { renderTexture: gpuTex, clear: true });
    });

    displaySprite.width = W;
    displaySprite.height = H;
    displaySprite.filters = filters;
    stage.addChild(displaySprite);

    return await measureGpuPhase(GPU_FILTER_EXTRACT_MEASURE, async () => {
      // Yield to the event loop so the GPU commands are flushed
      await new Promise<void>((r) => setTimeout(r, 0));

      const out = renderer.extract.canvas(stage) as HTMLCanvasElement;
      // extract.canvas returns the renderer's backing canvas when shared —
      // copy into a detached canvas so subsequent renders don't overwrite it.
      const copy = document.createElement('canvas');
      copy.width = W;
      copy.height = H;
      copy.getContext('2d')!.drawImage(out, 0, 0, W, H);
      return copy;
    });
  } finally {
    canvasTex.destroy(true);
    gpuTex.destroy(true);
  }
}
/**
 * Shared GPU render pipeline used by export, env map export, and thumbnail
 * generation. Blits a Canvas 2D source into a PixiJS RenderTexture, applies
 * GLSL filters, and extracts the result as an HTMLCanvasElement.
 *
 * Uses a serialized shared Renderer when available, with one-shot fallback if
 * the shared context is lost or a render poisons it.
 */
export async function gpuRenderToCanvas({
  width: W,
  height: H,
  source,
  filters,
}: GpuRenderOptions): Promise<HTMLCanvasElement> {
  return enqueueRender(async () => {
    return await measureGpuPhase(GPU_RENDER_MEASURE, async () => {
      const shared = getSharedRenderer(W, H);
      if (shared) {
        try {
          return await renderWithRenderer(shared, W, H, source, filters);
        } catch {
          disposeShared();
        }
      }

      if (gpuUnavailable) return cloneSourceCanvas(source, W, H);

      let renderer: Renderer;
      try {
        renderer = new Renderer({ width: W, height: H, backgroundAlpha: 0, antialias: false });
      } catch {
        gpuUnavailable = true;
        return cloneSourceCanvas(source, W, H);
      }
      try {
        return await renderWithRenderer(renderer, W, H, source, filters);
      } finally {
        try {
          renderer.destroy(true);
        } catch {
          /* already gone */
        }
      }
    });
  });
}
