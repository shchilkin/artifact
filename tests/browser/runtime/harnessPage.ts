// Browser side of the runtime parity harness (issue #331). The spec imports this module into the page from the dev
// server (`/@fs/`), next to the runtime source, and calls its functions through `page.evaluate`. Every result is
// plain JSON: images travel back as PNG data URLs.
import { type Artwork, createArtwork } from '../../../packages/runtime/src/artwork';
import { measureGpuTime } from '../../../packages/runtime/src/gpuTiming';
import { effectRegistry } from '../../../packages/runtime/src/index';
import { createLiveArtwork } from '../../../packages/runtime/src/liveArtwork';
import {
  caseFrameTime,
  DEFAULT_CASE_SEED,
  type EffectCase,
  FIXTURE_FILES,
  type FixtureName,
  GOLDEN_SIZE,
  PARITY_SIZE,
} from '../../../packages/runtime/src/testing/effectCase';
import {
  compareParity,
  diffImage,
  type ParityComparison,
  PIXEL_TOLERANCE,
  type RgbaImage,
  sideBySide,
} from '../../../packages/runtime/src/testing/parity';
import type { ChainPass } from '../../../packages/runtime/src/types';
import { EFFECT_CASES } from '../../../packages/runtime/test/cases/index';

type ConfigModule = typeof import('../../../apps/web/app/types/config');
type RendererModule = typeof import('../../../apps/web/app/utils/renderer');

/** Swaps part of the fragment (or of a later stage, see `ChainPass.stages`), to prove that a broken port fails parity. */
export interface FragmentPatch {
  readonly search: string;
  readonly replace: string;
}

export interface ParityOptions {
  readonly fragmentPatch?: FragmentPatch;
  /** Renders the runtime with a different seed than the editor. */
  readonly runtimeSeed?: number;
  /** Overrides the effect's registry flag, to exercise the other comparison. */
  readonly stochastic?: boolean;
}

export interface ParityResult {
  readonly comparison: ParityComparison;
  /** Editor | runtime | diff, as a PNG data URL. */
  readonly reviewPng: string;
  readonly patched: boolean;
}

const fixtureUrl = (fixture: FixtureName) =>
  new URL(`../../../packages/runtime/test/fixtures/${FIXTURE_FILES[fixture]}`, import.meta.url).href;

function caseFor(effect: string): EffectCase {
  const effectCase = EFFECT_CASES[effect];
  if (!effectCase) throw new Error(`No harness case for "${effect}".`);
  return effectCase;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function readPixels(source: CanvasImageSource, size: number): RgbaImage {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable.');
  ctx.drawImage(source, 0, 0, size, size);
  return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data };
}

function toPng(image: RgbaImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable.');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function editorLayer(config: ConfigModule, effectCase: EffectCase) {
  return {
    ...config.makeEffectPresetLayer(effectCase.effect as Parameters<ConfigModule['makeEffectPresetLayer']>[0]),
    ...effectCase.layer,
    seedOffset: 0,
  } as ReturnType<ConfigModule['makeEffectPresetLayer']>;
}

/** The editor's export path: an image layer of the fixture with the effect layer above it, through `renderDocument`. */
async function renderEditor(effectCase: EffectCase, fixture: FixtureName): Promise<RgbaImage> {
  const config = (await import(/* @vite-ignore */ '/app/types/config.ts')) as ConfigModule;
  const { renderDocument } = (await import(/* @vite-ignore */ '/app/utils/renderer.ts')) as RendererModule;
  const url = fixtureUrl(fixture);
  const image = await loadImage(url);
  const doc = {
    schemaVersion: config.DOCUMENT_SCHEMA_VERSION,
    global: { ...config.DEFAULT_GLOBAL, bg: '#000000', seed: effectCase.seed ?? DEFAULT_CASE_SEED },
    layers: [config.makeImageLayer(url, { fit: 'cover' }), editorLayer(config, effectCase)],
    export: config.DEFAULT_EXPORT,
  };
  const canvas = await renderDocument(doc, PARITY_SIZE, PARITY_SIZE, new Map([[url, image]]), {
    graphMode: 'stack',
  });
  return readPixels(canvas, PARITY_SIZE);
}

function runtimePass(effectCase: EffectCase, size: number, seed: number, patch?: FragmentPatch): ChainPass {
  const pass = effectRegistry.pass(
    effectCase.effect,
    { ...effectCase.layer, seedOffset: 0 },
    {
      seed,
      width: size,
      height: size,
    },
  );
  if (!pass) throw new Error(`"${effectCase.effect}" is off for the case's layer values.`);
  if (!patch) return pass;
  if (pass.fragment.includes(patch.search)) {
    return { ...pass, fragment: pass.fragment.replace(patch.search, patch.replace) };
  }
  const stage = (pass.stages ?? []).findIndex((fragment) => fragment.includes(patch.search));
  if (stage < 0) throw new Error(`Fragment patch "${patch.search}" does not apply.`);
  const stages = [...(pass.stages ?? [])];
  stages[stage] = stages[stage].replace(patch.search, patch.replace);
  return { ...pass, stages };
}

interface RuntimeRender {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly artwork: Artwork;
}

const RUNTIME_OPTIONS = {
  observeVisibility: null,
  devicePixelRatio: 1,
  contextAttributes: { preserveDrawingBuffer: true },
} as const;

/** Waits for the shaders (issue #419): the resting frame is drawn once they are ready. */
async function runtimeRender(canvas: HTMLCanvasElement, artwork: Artwork): Promise<RuntimeRender> {
  await artwork.ready;
  return { canvas, gl: canvas.getContext('webgl2') as WebGL2RenderingContext, artwork };
}

function sizedCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** The resting chain for parity: one pass, no bindings, as the editor renders the authored layer. */
function createRestingRuntime(source: TexImageSource, size: number, pass: ChainPass): Promise<RuntimeRender> {
  const canvas = sizedCanvas(size);
  const artwork = createArtwork({
    ...RUNTIME_OPTIONS,
    canvas,
    source,
    chain: [pass],
    reducedMotion: true,
    maxRenderSize: size,
  });
  return runtimeRender(canvas, artwork);
}

/**
 * The case as a live artwork: its layer as pass 0 with its bindings. Motion is allowed so bindings apply, but
 * nothing starts the loop: frames come from `setInput` and `seek` only. Pointer tracking is off; inputs come from the
 * frame declarations.
 */
function createLiveRuntime(effectCase: EffectCase, source: TexImageSource, size: number): Promise<RuntimeRender> {
  const canvas = sizedCanvas(size);
  const artwork = createLiveArtwork({
    ...RUNTIME_OPTIONS,
    canvas,
    source,
    passes: [{ effect: effectCase.effect, layer: { ...effectCase.layer, seedOffset: 0 } }],
    context: { seed: effectCase.seed ?? DEFAULT_CASE_SEED, width: size, height: size },
    bindings: effectCase.bindings,
    pointer: false,
    reducedMotion: false,
    maxRenderSize: size,
  });
  return runtimeRender(canvas, artwork);
}

export async function parity(effect: string, fixture: FixtureName, options: ParityOptions = {}): Promise<ParityResult> {
  const effectCase = caseFor(effect);
  const definition = effectRegistry.get(effect);
  if (!definition) throw new Error(`"${effect}" is not registered.`);
  const editor = await renderEditor(effectCase, fixture);
  const image = await loadImage(fixtureUrl(fixture));
  const seed = options.runtimeSeed ?? effectCase.seed ?? DEFAULT_CASE_SEED;
  const pass = runtimePass(effectCase, PARITY_SIZE, seed, options.fragmentPatch);
  // The resting frame, without the case's bindings: the authored values, as the editor renders them.
  const runtime = await createRestingRuntime(image, PARITY_SIZE, pass);
  const actual = readPixels(runtime.canvas, PARITY_SIZE);
  runtime.artwork.destroy();
  const comparison = compareParity(editor, actual, options.stochastic ?? definition.stochastic, {
    ...PIXEL_TOLERANCE,
    ...effectCase.pixelTolerance,
  });
  return {
    comparison,
    reviewPng: toPng(sideBySide([editor, actual, diffImage(editor, actual)])),
    patched: Boolean(options.fragmentPatch),
  };
}

export interface GoldenFrame {
  readonly name: string;
  readonly png: string;
}

/** Each declared frame through the case's bindings: inputs set, then `seek`, then the canvas read back. */
export async function goldens(effect: string): Promise<GoldenFrame[]> {
  const effectCase = caseFor(effect);
  const image = await loadImage(fixtureUrl(effectCase.goldenFixture ?? 'graphic'));
  const frames: GoldenFrame[] = [];
  for (const frame of effectCase.frames ?? []) {
    const runtime = await createLiveRuntime(effectCase, image, GOLDEN_SIZE);
    for (const [name, value] of Object.entries(frame.input ?? {})) runtime.artwork.setInput(name, value);
    runtime.artwork.seek(caseFrameTime(effectCase, frame.t));
    frames.push({ name: frame.name, png: toPng(readPixels(runtime.canvas, GOLDEN_SIZE)) });
    runtime.artwork.destroy();
  }
  return frames;
}

/** Median GPU time of the effect alone at 540px, or `null` when the context cannot time queries. */
export async function gpuTime(effect: string): Promise<number | null> {
  const effectCase = caseFor(effect);
  const image = await loadImage(fixtureUrl('photo'));
  const runtime = await createLiveRuntime(effectCase, image, PARITY_SIZE);
  try {
    const timing = await measureGpuTime(runtime.gl, () => runtime.artwork.seek(0));
    return timing?.medianMs ?? null;
  } finally {
    runtime.artwork.destroy();
  }
}

/** Registered effects without a harness case. */
export function uncoveredEffects(): string[] {
  return effectRegistry.ids().filter((id) => !EFFECT_CASES[id]);
}
