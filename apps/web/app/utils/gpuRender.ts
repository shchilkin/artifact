import type { Filter } from 'pixi.js';
import { Container, FORMATS, Renderer, RenderTexture, Sprite, Texture } from 'pixi.js';
import { recordGpuPass } from './gpuPassCost';

type GpuReadback = 'async' | 'sync';

interface GpuRenderOptions {
  width: number;
  height: number;
  source: HTMLCanvasElement;
  filters: Filter[];
  /** `sync` reads the result back with the blocking `extract.canvas`; the default follows `setGpuReadback`. */
  readback?: GpuReadback;
  /** Adds the pass to the device's GPU cost estimate (`gpuPassCost.ts`); the layer preview's passes only. */
  recordCost?: boolean;
}

let defaultReadback: GpuReadback = 'async';

/**
 * Readback for renders that do not pass `readback`. Both modes produce the same pixels; `sync` is the blocking
 * `extract.canvas` path that came before the non-blocking readback, kept for parity checks and diagnostics.
 */
export function setGpuReadback(readback: GpuReadback) {
  defaultReadback = readback;
}

const GPU_RENDER_MEASURE = 'artifact:gpu-render';
const GPU_QUEUE_WAIT_MEASURE = 'artifact:gpu-queue-wait';
const GPU_UPLOAD_MEASURE = 'artifact:gpu-upload';
const GPU_BLIT_MEASURE = 'artifact:gpu-blit';
const GPU_FILTER_EXTRACT_MEASURE = 'artifact:gpu-filter-extract';
/** Inside filter-extract: the GPU running the queued upload, blit, filters and pixel readback, timed by its fence. */
const GPU_FENCE_WAIT_MEASURE = 'artifact:gpu-fence-wait';
/** Inside filter-extract: copying the read-back pixels out of the GPU buffer and unpremultiplying them. */
const GPU_READBACK_MEASURE = 'artifact:gpu-readback';
/** Inside filter-extract: writing the read-back pixels into the output canvas. */
const GPU_TO_CANVAS_MEASURE = 'artifact:gpu-to-canvas';

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

interface StagePixels {
  pixels: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

const SYNC_POLL_TIMEOUT_MS = 2000;
/** Fence polls back to back for this long, which is all a hardware GPU usually needs. */
const FENCE_SPIN_MS = 2;
/** Interval between fence polls after that, while a slow GPU (such as software WebGL) is still working. */
const FENCE_BACKOFF_MS = 1;

let pollChannel: MessageChannel | null = null;
const pollWaiters: Array<() => void> = [];

/**
 * Resolves on the next task. A message-channel task is not clamped like nested `setTimeout(0)` (4 ms), so the
 * readback continues as soon as the GPU is done.
 */
function nextTask() {
  if (typeof MessageChannel === 'undefined') return new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!pollChannel) {
    pollChannel = new MessageChannel();
    pollChannel.port1.onmessage = () => pollWaiters.shift()?.();
  }
  const channel = pollChannel;
  return new Promise<void>((resolve) => {
    pollWaiters.push(resolve);
    channel.port2.postMessage(null);
  });
}

/**
 * Resolves after about `ms` with the main thread idle in between. The timer is set from a message-channel task, so
 * nested waits are not clamped to 4 ms.
 */
function idleWait(ms: number) {
  return nextTask().then(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

/**
 * Resolves once the GPU has executed every command issued before the fence, without blocking the main thread.
 * Polling on back-to-back tasks keeps the main thread busy for as long as the GPU works, so after a short spin the
 * polls are spaced out and the main thread stays free for input.
 */
async function waitForFence(gl: WebGL2RenderingContext, sync: WebGLSync) {
  gl.flush();
  const startedAt = now();
  while (true) {
    const status = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return true;
    const elapsed = now() - startedAt;
    if (status === gl.WAIT_FAILED || elapsed > SYNC_POLL_TIMEOUT_MS) return false;
    await (elapsed < FENCE_SPIN_MS ? nextTask() : idleWait(FENCE_BACKOFF_MS));
  }
}

/**
 * Same pixels as `renderer.extract.canvas(stage)`, read back through a pixel-pack buffer and a fence so the main
 * thread does not stall in `readPixels` while the GPU executes the filters. Returns null when the context is not
 * WebGL2 or the readback cannot complete, so the caller falls back to the synchronous extract.
 */
async function readStagePixelsAsync(renderer: Renderer, stage: Container): Promise<StagePixels | null> {
  const gl = renderer.gl;
  if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return null;

  // Mirrors Extract._rawPixels for a display-object target.
  const renderTexture = renderer.generateTexture(stage, {
    resolution: renderer.resolution,
    multisample: renderer.multisample,
  });
  const { frame, baseTexture } = renderTexture;
  const resolution = baseTexture.resolution;
  const width = Math.max(Math.round(frame.width * resolution), 1);
  const height = Math.max(Math.round(frame.height * resolution), 1);
  const premultipliedAlpha = baseTexture.alphaMode > 0 && baseTexture.format === FORMATS.RGBA;
  const byteLength = 4 * width * height;
  const buffer = gl.createBuffer();
  if (!buffer) {
    renderTexture.destroy(true);
    return null;
  }

  let sync: WebGLSync | null;
  try {
    renderer.renderTexture.bind(renderTexture);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ);
    gl.readPixels(
      Math.round(frame.x * resolution),
      Math.round(frame.y * resolution),
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      0,
    );
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  } catch (error) {
    gl.deleteBuffer(buffer);
    throw error;
  } finally {
    // The readback is queued, so the texture can go before the GPU has executed it.
    renderTexture.destroy(true);
  }

  try {
    if (!sync || !(await measureGpuPhase(GPU_FENCE_WAIT_MEASURE, () => waitForFence(gl, sync))) || gl.isContextLost()) {
      return null;
    }
    return measureGpuPhaseSync(GPU_READBACK_MEASURE, () => {
      const pixels = new Uint8Array(byteLength);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      if (premultipliedAlpha) unpremultiplyAlpha(pixels);
      return { pixels, width, height };
    });
  } finally {
    if (sync) gl.deleteSync(sync);
    gl.deleteBuffer(buffer);
  }
}

/**
 * Pixi's Extract._unpremultiplyAlpha (private there), with the same rounding so output stays byte-identical.
 * Opaque pixels are skipped: for alpha 255 the formula maps every channel value to itself.
 */
export function unpremultiplyAlpha(pixels: Uint8Array) {
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha === 0 || alpha === 255) continue;
    const scale = 255.001 / alpha;
    pixels[i] = pixels[i] * scale + 0.5;
    pixels[i + 1] = pixels[i + 1] * scale + 0.5;
    pixels[i + 2] = pixels[i + 2] * scale + 0.5;
  }
}

/** Matches the extract path: putImageData into a canvas, which the caller receives as a detached copy. */
function pixelsToCanvas({ pixels, width, height }: StagePixels, W: number, H: number): HTMLCanvasElement {
  const extracted = document.createElement('canvas');
  extracted.width = width;
  extracted.height = height;
  extracted.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), 0, 0);
  if (width === W && height === H) return extracted;
  const copy = document.createElement('canvas');
  copy.width = W;
  copy.height = H;
  copy.getContext('2d')!.drawImage(extracted, 0, 0, W, H);
  return copy;
}

async function renderWithRenderer(
  renderer: Renderer,
  W: number,
  H: number,
  source: HTMLCanvasElement,
  filters: Filter[],
  readback: GpuReadback,
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
      const asyncPixels = readback === 'async' ? await readStagePixelsAsync(renderer, stage) : null;
      if (asyncPixels) return measureGpuPhaseSync(GPU_TO_CANVAS_MEASURE, () => pixelsToCanvas(asyncPixels, W, H));

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
  readback = defaultReadback,
  recordCost = false,
}: GpuRenderOptions): Promise<HTMLCanvasElement> {
  return enqueueRender(async () => {
    return await measureGpuPhase(GPU_RENDER_MEASURE, async () => {
      const shared = getSharedRenderer(W, H);
      if (shared) {
        try {
          const startedAt = now();
          const output = await renderWithRenderer(shared, W, H, source, filters, readback);
          if (recordCost) recordGpuPass(now() - startedAt, W, H);
          return output;
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
        return await renderWithRenderer(renderer, W, H, source, filters, readback);
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
