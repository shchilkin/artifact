import { Container, Filter, Renderer, RenderTexture, Sprite, Texture } from 'pixi.js';

export interface ArtifactGpuEffectLayer {
  noiseWarp?: number;
  tearAmt?: number;
  tearSize?: number;
  vortex?: number;
}

export interface ArtifactGpuRenderOptions {
  filters: Filter[];
  height: number;
  onUnavailable?: 'copy-source' | 'throw';
  source: HTMLCanvasElement;
  width: number;
}

const NORM_UV = `
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;
`;

const SAMPLE = (uv: string) =>
  `texture2D(uSampler, clamp(inputClamp.xy + ${uv} * extent, inputClamp.xy, inputClamp.zw))`;

const HEADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;
`;

const NOISE_WARP_FRAGMENT = `${HEADER}
uniform float uIntensity;
uniform float uSeed;

float h21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float smooth21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1,0)), f.x),
    mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x),
    f.y
  );
}

void main() {
  ${NORM_UV}
  vec2 seed2 = vec2(uSeed * 0.001, uSeed * 0.0007);
  float ox = smooth21(norm * 4.0 + seed2)         - 0.5;
  float oy = smooth21(norm * 4.0 + seed2 + 100.0) - 0.5;
  ox += (smooth21(norm * 9.0 + seed2 * 2.0) - 0.5) * 0.4;
  oy += (smooth21(norm * 9.0 + seed2 * 2.0 + 50.0) - 0.5) * 0.4;
  vec2 warped = clamp(norm + vec2(ox, oy) * uIntensity, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const VORTEX_FRAGMENT = `${HEADER}
uniform float uIntensity;

void main() {
  ${NORM_UV}
  vec2  c    = norm - 0.5;
  float dist = length(c);
  float angle = atan(c.y, c.x);
  angle += uIntensity * max(0.0, 1.0 - dist * 2.2);
  vec2 warped = clamp(0.5 + dist * vec2(cos(angle), sin(angle)), 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const TEAR_FRAGMENT = `${HEADER}
uniform float uIntensity;
uniform float uChunkH;
uniform float uSeed;

float hash(float n) {
  return fract(sin(n * 127.1 + uSeed * 0.01) * 43758.5453);
}

void main() {
  ${NORM_UV}
  float chunkId    = floor(norm.y / uChunkH);
  float active     = step(0.7, hash(chunkId));
  float offsetNorm = (hash(chunkId + 57.3) - 0.5) * 2.0 * uIntensity * active;
  vec2 warped      = vec2(fract(norm.x + offsetNorm), norm.y);
  gl_FragColor     = ${SAMPLE('warped')};
}`;

function createFilter(fragment: string, uniforms: Record<string, unknown>) {
  const filter = new Filter(undefined, fragment, uniforms);
  filter.padding = 0;
  return filter;
}

export function createNoiseWarpFilter(amount: number, seed: number) {
  return createFilter(NOISE_WARP_FRAGMENT, { uIntensity: amount * 0.0008, uSeed: seed });
}

export function createVortexFilter(amount: number) {
  return createFilter(VORTEX_FRAGMENT, { uIntensity: amount * 0.03 });
}

export function createTearFilter(amount: number, size: number, seed: number) {
  return createFilter(TEAR_FRAGMENT, {
    uIntensity: amount * 0.007,
    uChunkH: size / 1000,
    uSeed: seed,
  });
}

export function buildArtifactGpuEffectFilters(layer: ArtifactGpuEffectLayer, seed: number): Filter[] {
  const filters: Filter[] = [];
  if (Number(layer.noiseWarp ?? 0) > 0) filters.push(createNoiseWarpFilter(Number(layer.noiseWarp), seed));
  if (Number(layer.vortex ?? 0) > 0) filters.push(createVortexFilter(Number(layer.vortex)));
  if (Number(layer.tearAmt ?? 0) > 0) {
    filters.push(createTearFilter(Number(layer.tearAmt), Number(layer.tearSize ?? 3), seed));
  }
  return filters;
}

let sharedRenderer: Renderer | null = null;
let sharedRendererSize = { height: 0, width: 0 };
let gpuUnavailable = false;
let renderQueue: Promise<unknown> = Promise.resolve();
let resourceLeases = 0;
const GPU_RENDER_MEASURE = 'artifact:gpu-render';
const GPU_QUEUE_WAIT_MEASURE = 'artifact:gpu-queue-wait';
const GPU_UPLOAD_MEASURE = 'artifact:gpu-upload';
const GPU_BLIT_MEASURE = 'artifact:gpu-blit';
const GPU_FILTER_EXTRACT_MEASURE = 'artifact:gpu-filter-extract';

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

function measureDuration(name: string, startedAt: number) {
  if (!canMeasure()) return;
  const markId = `${name}:${Math.random().toString(36).slice(2)}`;
  const startMark = `${markId}:start`;
  const endMark = `${markId}:end`;
  try {
    performance.mark(startMark, { startTime: startedAt });
    performance.mark(endMark, { startTime: now() });
    performance.measure(name, startMark, endMark);
  } finally {
    performance.clearMarks?.(startMark);
    performance.clearMarks?.(endMark);
  }
}

async function measureAsync<T>(name: string, task: () => Promise<T>) {
  const startedAt = now();
  try {
    return await task();
  } finally {
    measureDuration(name, startedAt);
  }
}

function measureSync<T>(name: string, task: () => T) {
  const startedAt = now();
  try {
    return task();
  } finally {
    measureDuration(name, startedAt);
  }
}

function disposeSharedRenderer() {
  try {
    sharedRenderer?.destroy(true);
  } catch {
    // The browser may already have discarded a lost WebGL context.
  }
  sharedRenderer = null;
  sharedRendererSize = { height: 0, width: 0 };
}

export function retainArtifactGpuResources() {
  resourceLeases += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    resourceLeases = Math.max(0, resourceLeases - 1);
    if (resourceLeases === 0) {
      disposeSharedRenderer();
      gpuUnavailable = false;
    }
  };
}

function getSharedRenderer(width: number, height: number) {
  if (gpuUnavailable) return null;
  try {
    if (!sharedRenderer) {
      sharedRenderer = new Renderer({ width, height, backgroundAlpha: 0, antialias: false });
      sharedRendererSize = { width, height };
      const canvas = sharedRenderer.view as HTMLCanvasElement;
      canvas.addEventListener?.('webglcontextlost', (event) => {
        event.preventDefault();
        disposeSharedRenderer();
      });
    } else if (sharedRendererSize.width < width || sharedRendererSize.height < height) {
      sharedRenderer.resize(width, height);
      sharedRendererSize = {
        width: Math.max(sharedRendererSize.width, width),
        height: Math.max(sharedRendererSize.height, height),
      };
    }
    return sharedRenderer;
  } catch {
    disposeSharedRenderer();
    gpuUnavailable = true;
    return null;
  }
}

function cloneCanvas(source: HTMLCanvasElement, width: number, height: number) {
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d');
  if (!context) throw new Error('Artifact Runtime could not create a GPU output canvas.');
  context.drawImage(source, 0, 0, width, height);
  return copy;
}

async function renderWithRenderer(
  renderer: Renderer,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  filters: Filter[],
) {
  const sourceTexture = measureSync(GPU_UPLOAD_MEASURE, () => Texture.from(source));
  const renderTexture = RenderTexture.create({ width, height });
  const sourceSprite = new Sprite(sourceTexture);
  const filteredSprite = new Sprite(renderTexture);
  const stage = new Container();

  try {
    sourceSprite.width = width;
    sourceSprite.height = height;
    measureSync(GPU_BLIT_MEASURE, () => {
      sourceTexture.update();
      renderer.render(sourceSprite, { renderTexture, clear: true });
    });

    filteredSprite.width = width;
    filteredSprite.height = height;
    filteredSprite.filters = filters;
    stage.addChild(filteredSprite);
    return await measureAsync(GPU_FILTER_EXTRACT_MEASURE, async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return cloneCanvas(renderer.extract.canvas(stage) as HTMLCanvasElement, width, height);
    });
  } finally {
    sourceTexture.destroy(true);
    renderTexture.destroy(true);
  }
}

function enqueueRender<T>(render: () => Promise<T>): Promise<T> {
  const queuedAt = now();
  const measuredRender = () => {
    measureDuration(GPU_QUEUE_WAIT_MEASURE, queuedAt);
    return render();
  };
  const next = renderQueue.then(measuredRender, measuredRender);
  renderQueue = next.catch(() => undefined);
  return next;
}

function unavailableResult(options: ArtifactGpuRenderOptions): HTMLCanvasElement {
  if (options.onUnavailable === 'throw') throw new Error('Artifact Runtime requires WebGL for this document.');
  return cloneCanvas(options.source, options.width, options.height);
}

export async function gpuRenderToCanvas(options: ArtifactGpuRenderOptions): Promise<HTMLCanvasElement> {
  return enqueueRender(async () => {
    return await measureAsync(GPU_RENDER_MEASURE, async () => {
      const shared = getSharedRenderer(options.width, options.height);
      if (shared) {
        try {
          return await renderWithRenderer(shared, options.source, options.width, options.height, options.filters);
        } catch {
          disposeSharedRenderer();
        }
      }

      if (gpuUnavailable) return unavailableResult(options);
      let renderer: Renderer;
      try {
        renderer = new Renderer({
          width: options.width,
          height: options.height,
          backgroundAlpha: 0,
          antialias: false,
        });
      } catch {
        gpuUnavailable = true;
        return unavailableResult(options);
      }

      try {
        return await renderWithRenderer(renderer, options.source, options.width, options.height, options.filters);
      } finally {
        try {
          renderer.destroy(true);
        } catch {
          // The browser may already have discarded a lost WebGL context.
        }
      }
    });
  });
}
