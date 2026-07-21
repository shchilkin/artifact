import { getEffectLayers, parseArtifactRuntimeProject } from './project.js';
import { evaluateMotionTrack, validateMotionRecipe } from './recipe.js';
import { applyChromaticAberration, applyGlitchEffect, applyGrain, applyScanlines, lcg } from './rendering.js';
import type {
  ArtifactEffectLayer,
  ArtifactRuntimePlayer,
  CreateArtifactRuntimePlayerOptions,
  MotionProperty,
  MotionRecipe,
} from './types.js';

const DEFAULT_FPS = 24;
const DEFAULT_MAX_RENDER_SIZE = 640;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Artifact Runtime could not load ${url}.`)), { once: true });
    image.src = url;
  });
}

function wrapTime(timeSeconds: number, durationSeconds: number) {
  return ((timeSeconds % durationSeconds) + durationSeconds) % durationSeconds;
}

function cloneLayer(layer: ArtifactEffectLayer): ArtifactEffectLayer {
  return { ...layer };
}

export async function createArtifactRuntimePlayer(
  options: CreateArtifactRuntimePlayerOptions,
): Promise<ArtifactRuntimePlayer> {
  const project = parseArtifactRuntimeProject(options.project);
  validateMotionRecipe(options.recipe, project);
  const image = await loadImage(options.baseImageUrl);
  const player = new RasterEffectsPlayer(options, project.document.global.seed, getEffectLayers(project), image);
  player.resize(options.canvas.clientWidth || image.naturalWidth, options.canvas.clientHeight || image.naturalHeight);
  player.seek(0);
  return player;
}

class RasterEffectsPlayer implements ArtifactRuntimePlayer {
  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #recipe: MotionRecipe;
  #seed: number;
  #layers: ArtifactEffectLayer[];
  #image: HTMLImageElement;
  #pixelRatio: number;
  #frameRequest: number | null = null;
  #lastFrameAt = 0;
  #startedAt = 0;
  #currentTime = 0;
  #playing = false;
  #destroyed = false;

  constructor(
    options: CreateArtifactRuntimePlayerOptions,
    seed: number,
    layers: ArtifactEffectLayer[],
    image: HTMLImageElement,
  ) {
    const context = options.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Artifact Runtime could not create a 2D context.');
    this.#canvas = options.canvas;
    this.#context = context;
    this.#recipe = options.recipe;
    this.#seed = seed;
    this.#layers = layers;
    this.#image = image;
    this.#pixelRatio = options.pixelRatio ?? window.devicePixelRatio ?? 1;
  }

  get isPlaying() {
    return this.#playing;
  }

  get currentTime() {
    return this.#currentTime;
  }

  play() {
    if (this.#destroyed || this.#playing) return;
    this.#playing = true;
    this.#startedAt = performance.now() - this.#currentTime * 1000;
    this.#frameRequest = requestAnimationFrame(this.#tick);
  }

  pause() {
    if (this.#destroyed || !this.#playing) return;
    this.#playing = false;
    if (this.#frameRequest !== null) cancelAnimationFrame(this.#frameRequest);
    this.#frameRequest = null;
  }

  seek(timeSeconds: number) {
    if (this.#destroyed || !Number.isFinite(timeSeconds)) return;
    this.#currentTime = wrapTime(timeSeconds, this.#recipe.durationSeconds);
    if (this.#playing) this.#startedAt = performance.now() - this.#currentTime * 1000;
    this.#render();
  }

  resize(width: number, height: number) {
    if (this.#destroyed || width <= 0 || height <= 0) return;
    const maxSize = this.#recipe.maxRenderSize ?? DEFAULT_MAX_RENDER_SIZE;
    const target = Math.max(1, Math.round(Math.min(width, height) * this.#pixelRatio));
    const size = Math.min(maxSize, target);
    if (this.#canvas.width === size && this.#canvas.height === size) return;
    this.#canvas.width = size;
    this.#canvas.height = size;
    this.#render();
  }

  destroy() {
    if (this.#destroyed) return;
    this.pause();
    this.#destroyed = true;
    this.#layers = [];
    this.#canvas.width = 1;
    this.#canvas.height = 1;
  }

  #tick = (timestamp: number) => {
    if (!this.#playing || this.#destroyed) return;
    const frameInterval = 1000 / (this.#recipe.framesPerSecond ?? DEFAULT_FPS);
    if (timestamp - this.#lastFrameAt >= frameInterval) {
      this.#lastFrameAt = timestamp;
      this.#currentTime = wrapTime((timestamp - this.#startedAt) / 1000, this.#recipe.durationSeconds);
      this.#render();
    }
    this.#frameRequest = requestAnimationFrame(this.#tick);
  };

  #render() {
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    if (width <= 1 || height <= 1) return;
    this.#context.clearRect(0, 0, width, height);
    this.#context.drawImage(this.#image, 0, 0, width, height);

    const progress = this.#currentTime / this.#recipe.durationSeconds;
    const overrides = this.#evaluateOverrides(progress);
    for (const sourceLayer of this.#layers) {
      if (sourceLayer.visible === false) continue;
      const layer = cloneLayer(sourceLayer);
      const layerOverrides = overrides.get(layer.id);
      if (!layerOverrides) continue;
      Object.assign(layer, layerOverrides);
      const scale = width / Math.max(1, this.#image.naturalWidth);
      const effectSeed = this.#seed + Math.round(layer.seedOffset ?? 0);
      applyGlitchEffect(this.#context, width, height, layer, scale, lcg(effectSeed ^ 0x1a2b3c));
      applyScanlines(this.#context, width, height, layer, scale);
      applyGrain(this.#context, width, height, layer, effectSeed);
      this.#applyChromaticAberration(layer.ca ?? 0, scale);
    }
  }

  #evaluateOverrides(progress: number) {
    const overrides = new Map<string, Partial<Record<MotionProperty, number>>>();
    for (const track of this.#recipe.tracks) {
      const layer = overrides.get(track.layerId) ?? {};
      layer[track.property] = evaluateMotionTrack(track, progress);
      overrides.set(track.layerId, layer);
    }
    return overrides;
  }

  #applyChromaticAberration(amount: number, scale: number) {
    if (amount <= 0) return;
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    const imageData = this.#context.getImageData(0, 0, width, height);
    applyChromaticAberration(imageData.data, width, height, Math.round(amount * scale));
    this.#context.putImageData(imageData, 0, 0);
  }
}
