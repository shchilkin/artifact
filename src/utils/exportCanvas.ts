import { Renderer, Container, Sprite, Texture, RenderTexture } from 'pixi.js';
import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';

function triggerDownload(dataUrl: string, seed: number, resolution: number) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `cover-${seed}-${resolution}.png`;
  a.click();
}

export async function exportCanvas(
  cfg: GeneratorConfig,
  seed: number,
  resolution: 1500 | 2000 | 3000,
): Promise<void> {
  const W = resolution;
  const H = resolution;

  // Step 1: canvas 2D render
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  await new Promise<void>((r) => setTimeout(() => {
    render(offscreen.getContext('2d', { willReadFrequently: true })!, W, H, cfg, seed);
    r();
  }, 0));

  const hasEffects = cfg.morphAmt > 0 || cfg.tearAmt > 0;

  if (!hasEffects) {
    triggerDownload(offscreen.toDataURL('image/png', 1.0), seed, resolution);
    return;
  }

  // Step 2: PixiJS blit pipeline (same as preview)
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
  displaySprite.filters = buildFilters(cfg.morphAmt, cfg.tearAmt, seed);

  const stage = new Container();
  stage.addChild(displaySprite);

  // Step 3: extract to canvas → download
  await new Promise<void>((r) => setTimeout(r, 0));
  const out: HTMLCanvasElement = renderer.plugins.extract.canvas(stage);

  triggerDownload(out.toDataURL('image/png', 1.0), seed, resolution);

  canvasTex.destroy(true);
  gpuTex.destroy(true);
  renderer.destroy(true);
}
