import type { BindingsDocument } from '../bindings.js';
import {
  LIVE_PACKAGE_FORMAT,
  LIVE_PACKAGE_VERSION,
  type LivePackage,
  type LivePackageManifest,
} from '../livePackage.js';
import type { CaseFrame } from './effectCase.js';

/**
 * The plate-parallax fixture (issue #394), shared by `tests/browser/runtime-plates.spec.ts` and the `/dev/runtime`
 * catalogue: a two-plate package built from the harness fixtures. The bottom plate is the photo (opaque to its edges,
 * so it needs cover when it moves), a Noise Warp chain runs on it, and the top plate is the graphic fixture as a card
 * on a transparent frame (free to move). The background is magenta, so an uncovered edge is easy to spot.
 */

export const PLATE_CASE_SIZE = 540;
/** Background colour of the fixture package: any of it at the frame's edge means a plate uncovered it. */
export const PLATE_CASE_BACKGROUND: readonly [number, number, number] = [255, 0, 255];
/** Default parallax strength: the nearest plate moves up to 4% of the frame each way. */
export const PLATE_CASE_STRENGTH = 0.04;
/** Default breathing: the nearest plate grows up to 2% over the loop. */
export const PLATE_CASE_BREATHING = 0.02;
export const PLATE_CASE_LOOP_SECONDS = 4;

export interface PlateCaseOptions {
  /** Parallax depth of the bottom and top plates. Default 0.5 and 1 (the exporter's stack-order default). */
  readonly depths?: readonly [number, number];
  /**
   * Whether the bottom plate lists its four edges, so it is scaled to cover when it moves. Default true; false is the
   * edge test's self-test.
   */
  readonly cover?: boolean;
}

export interface PlateBindingOptions {
  /** Offset at depth 1 for the pointer at an edge, as a fraction of the frame. */
  readonly strength?: number;
  /** Scale growth at depth 1 at the top of the breath. 0 turns breathing off. */
  readonly breathing?: number;
  /** Rotation at depth 1 for the pointer at the left or right edge, in degrees. */
  readonly tilt?: number;
}

/**
 * Pointer x/y move every plate by its depth (following the pointer); a wave breathes the scale. The wave starts at its
 * trough (`phase: 0.75`), so t = 0 with the pointer at rest in the centre is the still.
 */
export function plateCaseBindings(options: PlateBindingOptions = {}): BindingsDocument {
  const strength = options.strength ?? PLATE_CASE_STRENGTH;
  const breathing = options.breathing ?? PLATE_CASE_BREATHING;
  const tilt = options.tilt ?? 0;
  return {
    version: 1,
    loop: { durationSeconds: PLATE_CASE_LOOP_SECONDS },
    bindings: [
      { from: { input: 'pointer.x' }, to: { parallax: 'x' }, range: [-strength, strength] },
      { from: { input: 'pointer.y' }, to: { parallax: 'y' }, range: [-strength, strength] },
      ...(breathing > 0
        ? [{ from: { track: 'wave', phase: 0.75 }, to: { parallax: 'scale' }, range: [0, breathing] } as const]
        : []),
      ...(tilt !== 0
        ? [{ from: { input: 'pointer.x' }, to: { parallax: 'rotation' }, range: [-tilt, tilt] } as const]
        : []),
    ],
  };
}

/** The pointer at the centre and each corner (measured from the top left). */
export const PLATE_INPUT_FRAMES: readonly CaseFrame[] = [
  { name: 'pointer-centre', t: 0, input: { 'pointer.x': 0.5, 'pointer.y': 0.5 } },
  { name: 'pointer-top-left', t: 0, input: { 'pointer.x': 0, 'pointer.y': 0 } },
  { name: 'pointer-top-right', t: 0, input: { 'pointer.x': 1, 'pointer.y': 0 } },
  { name: 'pointer-bottom-left', t: 0, input: { 'pointer.x': 0, 'pointer.y': 1 } },
  { name: 'pointer-bottom-right', t: 0, input: { 'pointer.x': 1, 'pointer.y': 1 } },
];

/** One breath over the loop: rest, half way up, the top, half way down. */
export const PLATE_MOTION_FRAMES: readonly CaseFrame[] = [0, 0.25, 0.5, 0.75].map((t) => ({ name: `breath-${t}`, t }));

/**
 * The fixture package from decoded fixture images. `card` is the top plate's image: the graphic fixture inset on a
 * transparent frame (see `cardPlate`).
 */
export function plateCasePackage(
  photo: TexImageSource,
  card: TexImageSource,
  options: PlateCaseOptions & { readonly bindings?: BindingsDocument } = {},
): LivePackage {
  const [bottomDepth, topDepth] = options.depths ?? [0.5, 1];
  const manifest: LivePackageManifest = {
    format: LIVE_PACKAGE_FORMAT,
    version: LIVE_PACKAGE_VERSION,
    size: { width: PLATE_CASE_SIZE, height: PLATE_CASE_SIZE },
    maxRenderSize: PLATE_CASE_SIZE,
    seed: 11,
    still: 'plates/0.png',
    background: 'background.png',
    stack: [
      {
        type: 'plate',
        file: 'plates/0.png',
        layers: [{ id: 'photo', name: 'Photo' }],
        depth: bottomDepth,
        edges: (options.cover ?? true) ? ['top', 'right', 'bottom', 'left'] : [],
      },
      {
        type: 'chain',
        passes: [
          { effect: 'noiseWarp', layer: { noiseWarp: 40, seedOffset: 0 }, source: { id: 'warp', name: 'Noise Warp' } },
        ],
      },
      { type: 'plate', file: 'plates/2.png', layers: [{ id: 'card', name: 'Card' }], depth: topDepth, edges: [] },
    ],
    ...(options.bindings ? { bindings: options.bindings } : {}),
    baked: [],
  };
  return {
    manifest,
    images: { 'plates/0.png': photo, 'plates/2.png': card, 'background.png': solidPlate(PLATE_CASE_BACKGROUND) },
  };
}

/** The graphic fixture at half size in the centre of a transparent frame. */
export function cardPlate(graphic: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PLATE_CASE_SIZE;
  canvas.height = PLATE_CASE_SIZE;
  const inset = PLATE_CASE_SIZE / 4;
  canvas.getContext('2d')?.drawImage(graphic, inset, inset, PLATE_CASE_SIZE / 2, PLATE_CASE_SIZE / 2);
  return canvas;
}

function solidPlate([r, g, b]: readonly [number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PLATE_CASE_SIZE;
  canvas.height = PLATE_CASE_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, PLATE_CASE_SIZE, PLATE_CASE_SIZE);
  }
  return canvas;
}

/**
 * Pixels on the frame's border (the outermost ring) that are not opaque or show the background colour: what a plate
 * uncovered. Within `tolerance` levels of the background counts as background.
 */
export function uncoveredEdgePixels(
  image: { readonly width: number; readonly height: number; readonly data: ArrayLike<number> },
  background: readonly [number, number, number] = PLATE_CASE_BACKGROUND,
  tolerance = 24,
): number {
  const { width, height, data } = image;
  let count = 0;
  const check = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const isBackground =
      Math.abs(data[offset] - background[0]) <= tolerance &&
      Math.abs(data[offset + 1] - background[1]) <= tolerance &&
      Math.abs(data[offset + 2] - background[2]) <= tolerance;
    if (data[offset + 3] < 255 || isBackground) count += 1;
  };
  for (let x = 0; x < width; x += 1) {
    check(x, 0);
    check(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    check(0, y);
    check(width - 1, y);
  }
  return count;
}
