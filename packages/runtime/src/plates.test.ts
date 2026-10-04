import { describe, expect, it } from 'vitest';
import { createArtwork, type FrameState } from './artwork.js';
import { BindingError, compileLiveChain } from './bindings.js';
import { effectRegistry } from './effects/index.js';
import { createLiveArtwork } from './liveArtwork.js';
import {
  LIVE_PACKAGE_FORMAT,
  type LivePackage,
  LivePackageError,
  type LivePackageManifest,
  livePackageComposite,
  livePackageFiles,
  livePackagePlates,
  parseLivePackage,
} from './livePackage.js';
import {
  coverScale,
  defaultPlateDepth,
  NEUTRAL_PLATE_TRANSFORM,
  PLATE_EDGES,
  type PlateTransform,
  plateInfos,
  plateUniforms,
} from './plates.js';
import { createFakeCanvas, createFakeGl, createManualScheduler } from './testing/fakeGl.js';

const context = { seed: 4242, width: 540, height: 540 };
const warp = { effect: 'noiseWarp', layer: { noiseWarp: 40, seedOffset: 0 } };
const frame = (overrides: Partial<FrameState> = {}): FrameState => ({
  time: 0,
  clock: 0,
  frame: 0,
  inputs: {},
  reducedMotion: false,
  ...overrides,
});
const transform = (values: Partial<PlateTransform>): PlateTransform => ({ ...NEUTRAL_PLATE_TRANSFORM, ...values });

/** Maps a frame coordinate to the plate coordinate it shows, as the plate shaders do. */
function sampleAt(uniforms: ReturnType<typeof plateUniforms>, u: number, v: number): [number, number] {
  const [a, b, c, d] = uniforms.uPlateMatrix;
  const [ox, oy] = uniforms.uPlateOffset;
  const px = u - 0.5 - ox;
  const py = v - 0.5 - oy;
  return [a * px + c * py + 0.5, b * px + d * py + 0.5];
}

describe('plate transforms', () => {
  it('are the identity at rest, so a plate at rest samples where an untransformed plate does', () => {
    const uniforms = plateUniforms(NEUTRAL_PLATE_TRANSFORM, { depth: 1, edges: PLATE_EDGES }, 540, 540);
    expect(uniforms).toEqual({ uPlateMatrix: [1, 0, 0, 1], uPlateOffset: [0, 0], uPlateOpacity: 1 });
    expect(sampleAt(uniforms, 0.25, 0.75)).toEqual([0.25, 0.75]);
  });

  it('move a plate right and down with positive x and y', () => {
    const uniforms = plateUniforms(transform({ x: 0.1, y: 0.05 }), { depth: 1, edges: [] }, 540, 540);
    // The pixel at the frame centre now shows the plate point 10% left and 5% up of its centre.
    expect(sampleAt(uniforms, 0.5, 0.5)).toEqual([0.4, 0.45]);
  });

  it('rotate clockwise on screen, staying a rotation on a frame that is not square', () => {
    const uniforms = plateUniforms(transform({ rotation: 90 }), { depth: 1, edges: [] }, 1000, 500);
    // A quarter turn clockwise: the frame point right of centre (100 px) shows the plate point above centre.
    const [qx, qy] = sampleAt(uniforms, 0.5 + 100 / 1000, 0.5);
    expect(qx).toBeCloseTo(0.5);
    expect(qy).toBeCloseTo(0.5 - 100 / 500);
  });

  it('scale about the centre and clamp opacity', () => {
    const uniforms = plateUniforms(transform({ scale: 2, opacity: 1.4 }), { depth: 1, edges: [] }, 540, 540);
    expect(sampleAt(uniforms, 1, 1)).toEqual([0.75, 0.75]);
    expect(uniforms.uPlateOpacity).toBe(1);
  });

  it('cover a frame at any offset and rotation by scaling just enough', () => {
    expect(coverScale(NEUTRAL_PLATE_TRANSFORM, 540, 540)).toBe(1);
    expect(coverScale(transform({ x: 0.03 }), 540, 540)).toBeCloseTo(1.06);
    for (const values of [{ x: -0.04, y: 0.03 }, { rotation: 7 }, { x: 0.02, rotation: -4, scale: 0.9 }]) {
      for (const [width, height] of [
        [540, 540],
        [1080, 540],
      ]) {
        const uniforms = plateUniforms(transform(values), { depth: 1, edges: PLATE_EDGES }, width, height);
        for (const [u, v] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          const [qx, qy] = sampleAt(uniforms, u, v);
          for (const q of [qx, qy]) {
            expect(q).toBeGreaterThanOrEqual(-1e-9);
            expect(q).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it('do not cover a plate with a transparent border, which may move freely', () => {
    const uniforms = plateUniforms(transform({ x: 0.03 }), { depth: 1, edges: [] }, 540, 540);
    expect(uniforms.uPlateMatrix).toEqual([1, 0, 0, 1]);
  });

  it('cover only the sides a plate reaches, and only when the move takes them inward', () => {
    // A plate that reaches the bottom of the frame (a phone photo cut off at the bottom).
    expect(coverScale(transform({ y: 0.03 }), 540, 540, ['bottom'])).toBeCloseTo(0.94);
    expect(coverScale(transform({ y: -0.03 }), 540, 540, ['bottom'])).toBeCloseTo(1.06);
    expect(coverScale(transform({ x: 0.05 }), 540, 540, ['bottom'])).toBeCloseTo(1);
    const lifted = plateUniforms(transform({ y: 0.03 }), { depth: 1, edges: ['bottom'] }, 540, 540);
    expect(lifted.uPlateMatrix).toEqual([1, 0, 0, 1]);
    const raised = plateUniforms(transform({ y: -0.03, rotation: 3 }), { depth: 1, edges: ['bottom'] }, 540, 540);
    for (const u of [0, 1]) expect(sampleAt(raised, u, 1)[1]).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('default depth by stack order, top plates nearer, and every edge', () => {
    expect([0, 1, 2].map((index) => defaultPlateDepth(index, 3))).toEqual([1 / 3, 2 / 3, 1]);
    expect(plateInfos([{}, { depth: 0.2, edges: [] }])).toEqual([
      { depth: 0.5, edges: PLATE_EDGES },
      { depth: 0.2, edges: [] },
    ]);
  });
});

describe('plate bindings', () => {
  const plates = [{ depth: 0.5 }, { depth: 1 }];

  it('scale one parallax binding by each plate’s depth, after the plate’s own bindings', () => {
    const live = compileLiveChain({
      passes: [warp],
      plates,
      context,
      bindings: {
        version: 1,
        bindings: [
          { from: { input: 'pointer.x' }, to: { parallax: 'x' }, range: [-0.04, 0.04] },
          { from: { input: 'hover' }, to: { plate: 1, transform: 'opacity' }, range: [1, 0.5] },
          { from: { input: 'hover' }, to: { plate: 1, transform: 'x' }, range: [0, 0.01] },
        ],
      },
    });
    expect(live.plates.moving).toEqual([0, 1]);
    const transforms = live.plates.transforms(frame({ inputs: { 'pointer.x': 1, hover: 1 } }))!;
    expect(transforms[0]!.x).toBeCloseTo(0.02);
    expect(transforms[1]).toMatchObject({ opacity: 0.5, scale: 1 });
    expect(transforms[1]!.x).toBeCloseTo(0.05);
  });

  it('are neutral at rest: pointer centred, a breathing wave at its trough at t = 0', () => {
    const live = compileLiveChain({
      passes: [warp],
      plates,
      context,
      bindings: {
        version: 1,
        loop: { durationSeconds: 6 },
        bindings: [
          { from: { input: 'pointer.x' }, to: { parallax: 'x' }, range: [-0.03, 0.03] },
          { from: { input: 'pointer.y' }, to: { parallax: 'y' }, range: [-0.03, 0.03] },
          { from: { track: 'wave', phase: 0.75 }, to: { parallax: 'scale' }, range: [0, 0.02] },
        ],
      },
    });
    for (const resting of live.plates.transforms(frame())!.map((value) => value!)) {
      expect(resting.x).toBeCloseTo(0, 12);
      expect(resting.y).toBeCloseTo(0, 12);
      expect(resting.scale).toBeCloseTo(1, 12);
    }
    const breathing = live.plates.transforms(frame({ time: 3 }))!;
    expect(breathing[1]!.scale).toBeCloseTo(1.02);
    expect(breathing[0]!.scale).toBeCloseTo(1.01);
  });

  it('leave plates without bindings and depth 0 out of the moving set, and stop under reduced motion', () => {
    const live = compileLiveChain({
      passes: [warp],
      plates: [{ depth: 0 }, { depth: 1 }],
      context,
      bindings: { version: 1, bindings: [{ from: { input: 'pointer.x' }, to: { parallax: 'x' } }] },
    });
    expect(live.plates.moving).toEqual([1]);
    expect(live.plates.transforms(frame({ reducedMotion: true }))).toBeUndefined();
    expect(live.inputs).toEqual(['pointer.x']);
  });

  it('report malformed and out-of-range plate targets with their paths', () => {
    const issues = (bindings: unknown, withPlates = plates) => {
      try {
        compileLiveChain({ passes: [warp], plates: withPlates, context, bindings });
      } catch (error) {
        if (error instanceof BindingError) return error.issues;
        throw error;
      }
      return [];
    };
    expect(
      issues({
        version: 1,
        bindings: [
          { from: { input: 'hover' }, to: { plate: -1, transform: 'skew' } },
          { from: { input: 'hover' }, to: { parallax: 'opacity' } },
          { from: { input: 'hover' }, to: { plate: 0, transform: 'x', field: 'noiseWarp' } },
        ],
      }),
    ).toEqual([
      'bindings[0].to.plate: must be a plate index (0 is the bottom plate), got -1',
      'bindings[0].to.transform: must be one of x, y, scale, rotation, opacity, got "skew"',
      'bindings[1].to.parallax: must be one of x, y, scale, rotation, got "opacity"',
      'bindings[2].to.field: unknown key; expected one of plate, transform',
    ]);
    expect(issues({ version: 1, bindings: [{ from: { input: 'hover' }, to: { plate: 2, transform: 'x' } }] })).toEqual([
      'bindings[0].to.plate: there is no plate 2; the package has 2 (0 is the bottom)',
    ]);
    expect(issues({ version: 1, bindings: [{ from: { input: 'hover' }, to: { parallax: 'x' } }] }, [])).toEqual([
      'bindings[0].to.parallax: parallax moves plates; only a live package has plates',
    ]);
  });
});

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: LIVE_PACKAGE_FORMAT,
    version: 1,
    size: { width: 540, height: 540 },
    maxRenderSize: 540,
    seed: 4242,
    still: 'still.png',
    background: 'background.png',
    stack: [
      { type: 'plate', file: 'plates/0.png', layers: [{ id: 'fill', name: 'Fill' }], depth: 0.5 },
      { type: 'chain', passes: [{ ...warp, source: { id: 'warp', name: 'Noise Warp' } }] },
      { type: 'plate', file: 'plates/2.png', layers: [{ id: 'title', name: 'Title' }], depth: 1, edges: ['bottom'] },
    ],
    baked: [],
    ...overrides,
  };
}

const parallax = {
  version: 1,
  bindings: [
    { from: { input: 'pointer.x' }, to: { parallax: 'x' }, range: [-0.03, 0.03] },
    { from: { input: 'pointer.y' }, to: { parallax: 'y' }, range: [-0.03, 0.03] },
  ],
};

describe('plates in a live package', () => {
  it('reads depth and edges, and checks them with their paths', () => {
    const parsed = parseLivePackage(manifest({ bindings: parallax })) as LivePackageManifest;
    expect(livePackagePlates(parsed)).toEqual([
      { depth: 0.5, edges: PLATE_EDGES, layers: [{ id: 'fill', name: 'Fill' }] },
      { depth: 1, edges: ['bottom'], layers: [{ id: 'title', name: 'Title' }] },
    ]);
    const stack = (manifest().stack as Record<string, unknown>[]).map((item) => ({ ...item }));
    stack[0].depth = -1;
    stack[2].edges = ['bottom', 'bottom'];
    expect(() => parseLivePackage(manifest({ stack }))).toThrow(LivePackageError);
    try {
      parseLivePackage(manifest({ stack }));
    } catch (error) {
      expect((error as LivePackageError).issues).toEqual([
        'stack[0].depth: must be a number ≥ 0 (0 stays put, 1 is the nearest), got -1',
        'stack[2].edges: must list sides once each from top, right, bottom, left, got ["bottom","bottom"]',
      ]);
    }
  });

  it('checks plate targets against the package’s plates', () => {
    const bindings = { version: 1, bindings: [{ from: { input: 'hover' }, to: { plate: 2, transform: 'y' } }] };
    expect(() => parseLivePackage(manifest({ bindings }))).toThrow(
      'bindings.bindings[0].to.plate: there is no plate 2; the package has 2 (0 is the bottom)',
    );
  });

  it('places a moving bottom plate first, so the chain runs on the moved plate', () => {
    const parsed = parseLivePackage(manifest()) as LivePackageManifest;
    const images = Object.fromEntries(livePackageFiles(parsed).map((file) => [file, {} as ImageBitmap]));
    const pass = effectRegistry.pass(warp.effect, warp.layer, context)!;
    const still = livePackageComposite({ manifest: parsed, images }, [pass]);
    expect(still.steps.map((step) => step.kind)).toEqual(['pass', 'over', 'under']);
    expect(still.plateSteps).toEqual([-1, -1]);
    const moving = livePackageComposite({ manifest: parsed, images }, [pass], [0, 1]);
    expect(moving.steps.map((step) => ('plate' in step ? step : step.kind))).toEqual([
      { kind: 'place', plate: 0 },
      'pass',
      { kind: 'over', plate: 1, transform: true },
      { kind: 'under', plate: 2 },
    ]);
    expect(moving.plateSteps).toEqual([0, 2]);
    expect(moving.passSteps).toEqual([1]);
  });

  it('draws one extra step for a moving bottom plate, with no readback, and only while motion is allowed', () => {
    const parsed = parseLivePackage(manifest({ bindings: parallax })) as LivePackageManifest;
    const livePackage: LivePackage = {
      manifest: parsed,
      images: Object.fromEntries(livePackageFiles(parsed).map((file) => [file, {} as ImageBitmap])),
    };
    const fake = createFakeGl();
    const artwork = createLiveArtwork({
      canvas: createFakeCanvas(fake),
      livePackage,
      reducedMotion: false,
      devicePixelRatio: 1,
      observeVisibility: null,
      scheduler: createManualScheduler(),
    });
    expect(fake.counts.draws).toBe(4);
    artwork.setInput('pointer.x', 1);
    expect(fake.counts.draws).toBe(8);
    expect(fake.counts.readPixels).toBe(0);
    artwork.destroy();
    expect(fake.live()).toEqual({});

    // Without bindings the package draws as before: no placing step.
    const still = createFakeGl();
    createArtwork({
      canvas: createFakeCanvas(still),
      livePackage,
      reducedMotion: true,
      devicePixelRatio: 1,
      observeVisibility: null,
    }).destroy();
    expect(still.counts.draws).toBe(3);
  });
});
