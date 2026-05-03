import { Renderer, Container, Sprite, Texture, RenderTexture } from 'pixi.js';
import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';

const W = 4096;
const H = 2048;

/**
 * Elements that look right on the flat 2D preview appear ~4× larger
 * when viewed through a typical 3D camera FOV on a sphere. This factor
 * scales emojis, glitch streaks, scanlines and CA shifts down during
 * the env map render pass only. Tune here without touching other logic.
 */
export const ENV_EXPORT_SCALE_FACTOR = 4;

function triggerBlobDownload(canvas: HTMLCanvasElement, seed: number) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `envmap-${seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, 'image/png');
}

export async function exportEnvMap(cfg: GeneratorConfig, seed: number): Promise<void> {
  // Step 1: canvas 2D render at 4096×2048
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  await new Promise<void>((r) =>
    setTimeout(() => {
      render(offscreen.getContext('2d', { willReadFrequently: true })!, W, H, cfg, seed, 1 / ENV_EXPORT_SCALE_FACTOR);
      r();
    }, 0)
  );

  // Step 2: PixiJS GPU filter pass (use H as ref so pixelate blocks are square)
  const filters = buildFilters(cfg, seed, H);

  if (!filters) {
    triggerBlobDownload(offscreen, seed);
    return;
  }

  const renderer = new Renderer({ width: W, height: H, backgroundAlpha: 0, antialias: false });

  const canvasTex = Texture.from(offscreen);
  const blitSprite = new Sprite(canvasTex);
  blitSprite.width = W;
  blitSprite.height = H;

  const gpuTex = RenderTexture.create({ width: W, height: H });
  canvasTex.update();
  renderer.render(blitSprite, { renderTexture: gpuTex, clear: true });

  const displaySprite = new Sprite(gpuTex);
  displaySprite.width = W;
  displaySprite.height = H;
  displaySprite.filters = filters;

  const stage = new Container();
  stage.addChild(displaySprite);

  await new Promise<void>((r) => setTimeout(r, 0));
  const out: HTMLCanvasElement = renderer.plugins.extract.canvas(stage);

  // Destroy GPU resources immediately before triggering download
  canvasTex.destroy(true);
  gpuTex.destroy(true);
  renderer.destroy(true);

  triggerBlobDownload(out, seed);
}
