import { useEffect, useLayoutEffect, useRef } from "react";
import { Container, Renderer, RenderTexture, Sprite, Texture } from "pixi.js";
import type { GeneratorConfig } from "../types/config";
import { render as render2D } from "../utils/renderer";
import { buildFilters } from "../utils/pixiFilters";

const SIZE = 540;

interface PixiState {
  renderer: Renderer;
  // Stage shown to screen — displaySprite reads from gpuTex
  stage: Container;
  displaySprite: Sprite;
  // Intermediate GPU texture — blit from offscreen canvas before filter runs
  gpuTex: RenderTexture;
  // Scratch sprite used only for the canvas→GPU blit
  blitSprite: Sprite;
  // Offscreen canvas where canvas-2D pipeline renders
  offscreen: HTMLCanvasElement;
  canvasTex: Texture;
}

function doRender(
  pixi: PixiState,
  cfg: GeneratorConfig,
  seed: number,
  bgImage: HTMLImageElement | null = null,
) {
  const {
    renderer,
    stage,
    displaySprite,
    gpuTex,
    blitSprite,
    offscreen,
    canvasTex,
  } = pixi;

  // 1. Canvas 2D render
  const ctx = offscreen.getContext("2d", { willReadFrequently: true })!;
  render2D(ctx, SIZE, SIZE, cfg, seed, 1, bgImage);

  // 2. Blit canvas → GPU RenderTexture (no filters on this pass)
  canvasTex.update();
  renderer.render(blitSprite, { renderTexture: gpuTex, clear: true });

  // 3. Apply pixi effects on the GPU texture → screen
  displaySprite.filters = buildFilters(cfg, seed);
  renderer.render(stage);
}

export function usePixiRenderer(
  cfg: GeneratorConfig,
  seed: number,
  bgImage: HTMLImageElement | null = null,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<PixiState | null>(null);
  const cfgRef = useRef(cfg);
  const seedRef = useRef(seed);
  const bgImageRef = useRef(bgImage);

  useEffect(() => {
    cfgRef.current = cfg;
    seedRef.current = seed;
    bgImageRef.current = bgImage;
  }, [cfg, seed, bgImage]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = SIZE;
    offscreen.height = SIZE;
    offscreen.getContext("2d", { willReadFrequently: true });

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        width: SIZE,
        height: SIZE,
        backgroundAlpha: 0,
        antialias: false,
      });
    } catch {
      return;
    }
    container.appendChild(renderer.view as HTMLCanvasElement);

    // Canvas → GPU blit pipeline
    const canvasTex = Texture.from(offscreen);
    const blitSprite = new Sprite(canvasTex);
    blitSprite.width = SIZE;
    blitSprite.height = SIZE;

    // GPU render texture that filters read from
    const gpuTex = RenderTexture.create({ width: SIZE, height: SIZE });

    // Display sprite reads the GPU texture
    const displaySprite = new Sprite(gpuTex);
    displaySprite.width = SIZE;
    displaySprite.height = SIZE;

    const stage = new Container();
    stage.addChild(displaySprite);

    const state: PixiState = {
      renderer,
      stage,
      displaySprite,
      gpuTex,
      blitSprite,
      offscreen,
      canvasTex,
    };
    pixiRef.current = state;

    doRender(state, cfgRef.current, seedRef.current, bgImageRef.current);

    return () => {
      canvasTex.destroy(true);
      gpuTex.destroy(true);
      renderer.destroy(true);
      pixiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const pixi = pixiRef.current;
    if (!pixi) return;
    doRender(pixi, cfg, seed, bgImage);
  }, [cfg, seed, bgImage]);

  return containerRef;
}
