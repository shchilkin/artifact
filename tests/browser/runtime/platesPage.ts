// Browser side of the plate-parallax spec (issue #394). Imported into the page from the dev server (`/@fs/`), like
// harnessPage.ts; every result is plain JSON, images as PNG data URLs.
import { type Artwork, createArtwork } from '../../../packages/runtime/src/artwork';
import type { BindingsDocument } from '../../../packages/runtime/src/bindings';
import { createLiveArtwork } from '../../../packages/runtime/src/liveArtwork';
import type { LivePackage } from '../../../packages/runtime/src/livePackage';
import { GOLDEN_SIZE } from '../../../packages/runtime/src/testing/effectCase';
import { compareParity, type ParityComparison, type RgbaImage } from '../../../packages/runtime/src/testing/parity';
import {
  cardPlate,
  PLATE_CASE_LOOP_SECONDS,
  PLATE_CASE_SIZE,
  PLATE_INPUT_FRAMES,
  PLATE_MOTION_FRAMES,
  type PlateBindingOptions,
  type PlateCaseOptions,
  plateCaseBindings,
  plateCasePackage,
  uncoveredEdgePixels,
} from '../../../packages/runtime/src/testing/plateCase';

const fixtureUrl = (file: string) => new URL(`../../../packages/runtime/test/fixtures/${file}`, import.meta.url).href;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function fixturePackage(options: PlateCaseOptions & { bindings?: BindingsDocument } = {}): Promise<LivePackage> {
  const [photo, graphic] = await Promise.all([
    loadImage(fixtureUrl('photo.webp')),
    loadImage(fixtureUrl('graphic.png')),
  ]);
  return plateCasePackage(photo, cardPlate(graphic), options);
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
  canvas
    .getContext('2d')
    ?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

const OPTIONS = {
  observeVisibility: null,
  devicePixelRatio: 1,
  contextAttributes: { preserveDrawingBuffer: true },
} as const;

/** The package with its bindings, motion allowed, nothing scheduled: frames come from `setInput` and `seek`. */
function liveArtwork(livePackage: LivePackage, size: number): { canvas: HTMLCanvasElement; artwork: Artwork } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const artwork = createLiveArtwork({
    ...OPTIONS,
    canvas,
    livePackage,
    pointer: false,
    reducedMotion: false,
    maxRenderSize: size,
  });
  return { canvas, artwork };
}

function frameOf(livePackage: LivePackage, size: number, input: Record<string, number>, seconds: number): RgbaImage {
  const { canvas, artwork } = liveArtwork(livePackage, size);
  for (const [name, value] of Object.entries(input)) artwork.setInput(name, value);
  artwork.seek(seconds);
  const pixels = readPixels(canvas, size);
  artwork.destroy();
  return pixels;
}

export interface RestResult {
  readonly comparison: ParityComparison;
  /** Moving plates draw through the transform shaders; the still through the plain composite. */
  readonly identical: boolean;
}

/**
 * The resting frame with parallax and breathing bindings (pointer at rest, t = 0) against the same package drawn as
 * a still (no bindings, plain composite steps).
 */
export async function restingParity(): Promise<RestResult> {
  const bound = await fixturePackage({ bindings: plateCaseBindings({ tilt: 3 }) });
  const live = frameOf(bound, PLATE_CASE_SIZE, {}, 0);
  const canvas = document.createElement('canvas');
  canvas.width = PLATE_CASE_SIZE;
  canvas.height = PLATE_CASE_SIZE;
  const still = createArtwork({
    ...OPTIONS,
    canvas,
    livePackage: await fixturePackage(),
    reducedMotion: true,
    maxRenderSize: PLATE_CASE_SIZE,
  });
  const expected = readPixels(canvas, PLATE_CASE_SIZE);
  still.destroy();
  return {
    comparison: compareParity(expected, live, false),
    identical: expected.data.every((value, index) => value === live.data[index]),
  };
}

export interface GoldenFrame {
  readonly name: string;
  readonly png: string;
}

/** The pointer at the centre and the corners, then one breath, at the golden size. */
export async function goldens(): Promise<GoldenFrame[]> {
  const livePackage = await fixturePackage({ bindings: plateCaseBindings() });
  return [...PLATE_INPUT_FRAMES, ...PLATE_MOTION_FRAMES].map((frame) => ({
    name: frame.name,
    png: toPng(frameOf(livePackage, GOLDEN_SIZE, { ...frame.input }, frame.t * PLATE_CASE_LOOP_SECONDS)),
  }));
}

export interface EdgeResult {
  readonly name: string;
  /** Border pixels that show the background or are not opaque. */
  readonly uncovered: number;
  readonly png: string;
}

/**
 * Every pointer corner at the strongest settings (and the top of a breath, and with a tilt), with the bottom plate
 * nearest: its border must stay covered.
 */
export async function edges(
  options: PlateCaseOptions & { bindings?: PlateBindingOptions } = {},
): Promise<EdgeResult[]> {
  const livePackage = await fixturePackage({
    depths: options.depths ?? [1, 1],
    cover: options.cover,
    bindings: plateCaseBindings(options.bindings),
  });
  const results: EdgeResult[] = [];
  for (const frame of PLATE_INPUT_FRAMES) {
    for (const t of [0, 0.5]) {
      const pixels = frameOf(livePackage, PLATE_CASE_SIZE, { ...frame.input }, t * PLATE_CASE_LOOP_SECONDS);
      results.push({ name: `${frame.name}-t${t}`, uncovered: uncoveredEdgePixels(pixels), png: toPng(pixels) });
    }
  }
  return results;
}
