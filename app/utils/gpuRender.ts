import { Renderer, Container, Sprite, Texture, RenderTexture } from 'pixi.js';
import type { Filter } from 'pixi.js';

interface GpuRenderOptions {
  width: number;
  height: number;
  source: HTMLCanvasElement;
  filters: Filter[];
}

/**
 * One renderer per browser tab. Creating a Renderer = creating a WebGL context;
 * browsers cap concurrent contexts (~16) and start dropping the oldest. Sharing
 * one context across previews and thumbnails avoids exhausting that limit during
 * interactive edits.
 */
let sharedRenderer: Renderer | null = null;
let sharedRendererSize = { w: 0, h: 0 };

function disposeShared() {
  if (sharedRenderer) {
    try { sharedRenderer.destroy(true); } catch { /* already gone */ }
  }
  sharedRenderer = null;
  sharedRendererSize = { w: 0, h: 0 };
}

function getSharedRenderer(W: number, H: number): Renderer | null {
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
    return null;
  }
}

/**
 * Serialize render calls — Pixi extracts a single backing canvas, so two
 * concurrent renders would race. The queue keeps work strictly sequential.
 */
let renderQueue: Promise<unknown> = Promise.resolve();

function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
  const next = renderQueue.then(() => fn(), () => fn());
  renderQueue = next.catch(() => undefined);
  return next;
}

async function renderWithRenderer(
  renderer: Renderer,
  W: number,
  H: number,
  source: HTMLCanvasElement,
  filters: Filter[],
): Promise<HTMLCanvasElement> {
  const canvasTex = Texture.from(source);
  const gpuTex = RenderTexture.create({ width: W, height: H });
  const blitSprite = new Sprite(canvasTex);
  const displaySprite = new Sprite(gpuTex);
  const stage = new Container();

  try {
    blitSprite.width = W;
    blitSprite.height = H;

    canvasTex.update();
    renderer.render(blitSprite, { renderTexture: gpuTex, clear: true });

    displaySprite.width = W;
    displaySprite.height = H;
    displaySprite.filters = filters;
    stage.addChild(displaySprite);

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
    const shared = getSharedRenderer(W, H);
    if (shared) {
      try {
        return await renderWithRenderer(shared, W, H, source, filters);
      } catch {
        disposeShared();
      }
    }

    const renderer = new Renderer({ width: W, height: H, backgroundAlpha: 0, antialias: false });
    try {
      return await renderWithRenderer(renderer, W, H, source, filters);
    } finally {
      try { renderer.destroy(true); } catch { /* already gone */ }
    }
  });
}
