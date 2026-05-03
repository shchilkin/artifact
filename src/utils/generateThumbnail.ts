import { Renderer, Container, Sprite, Texture, RenderTexture } from 'pixi.js';
import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';
import { buildFilters } from './pixiFilters';

const THUMB_SIZE = 200;

/**
 * Renders the full pipeline (Canvas 2D + PixiJS GPU filters) at thumbnail
 * resolution so presets accurately reflect the actual cover appearance.
 */
export async function generateThumbnail(cfg: GeneratorConfig, seed: number): Promise<string> {
  const W = THUMB_SIZE;
  const H = THUMB_SIZE;

  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;

  await new Promise<void>((r) =>
    setTimeout(() => {
      render(offscreen.getContext('2d', { willReadFrequently: true })!, W, H, cfg, seed);
      r();
    }, 0)
  );

  const filters = buildFilters(cfg, seed);

  if (!filters) {
    return offscreen.toDataURL('image/jpeg', 0.8);
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

  const dataUrl = out.toDataURL('image/jpeg', 0.8);

  canvasTex.destroy(true);
  gpuTex.destroy(true);
  renderer.destroy(true);

  return dataUrl;
}
