import { Renderer, Container, Sprite, Texture, RenderTexture } from 'pixi.js';
import type { Filter } from 'pixi.js';

interface GpuRenderOptions {
  width: number;
  height: number;
  source: HTMLCanvasElement;
  filters: Filter[];
}

/**
 * Shared GPU render pipeline used by export, env map export, and thumbnail
 * generation. Blits a Canvas 2D source into a PixiJS RenderTexture, applies
 * GLSL filters, and extracts the result as an HTMLCanvasElement.
 *
 * Cleans up all GPU resources before returning, even on error.
 */
export async function gpuRenderToCanvas({
  width: W,
  height: H,
  source,
  filters,
}: GpuRenderOptions): Promise<HTMLCanvasElement> {
  const renderer = new Renderer({ width: W, height: H, backgroundAlpha: 0, antialias: false });
  const canvasTex = Texture.from(source);
  const gpuTex = RenderTexture.create({ width: W, height: H });

  try {
    const blitSprite = new Sprite(canvasTex);
    blitSprite.width = W;
    blitSprite.height = H;

    canvasTex.update();
    renderer.render(blitSprite, { renderTexture: gpuTex, clear: true });

    const displaySprite = new Sprite(gpuTex);
    displaySprite.width = W;
    displaySprite.height = H;
    displaySprite.filters = filters;

    const stage = new Container();
    stage.addChild(displaySprite);

    // Yield to the event loop so the GPU commands are flushed
    await new Promise<void>((r) => setTimeout(r, 0));

    return renderer.plugins.extract.canvas(stage) as HTMLCanvasElement;
  } finally {
    canvasTex.destroy(true);
    gpuTex.destroy(true);
    renderer.destroy(true);
  }
}
