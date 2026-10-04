import { describe, expect, it } from 'vitest';
import type { FrameState } from './artwork.js';
import { BindingError, compileLiveChain, type LiveChainOptions, type LivePass } from './bindings.js';
import { findLayer, LayerOptionsError, layerPolicy } from './layers.js';
import { createLiveArtwork } from './liveArtwork.js';
import {
  LIVE_PACKAGE_FORMAT,
  type LivePackage,
  LivePackageError,
  type LivePackageManifest,
  livePackageFiles,
  livePackageLayers,
  parseLivePackage,
} from './livePackage.js';
import { createFakeCanvas, createFakeGl, createManualScheduler } from './testing/fakeGl.js';
import type { UniformValues } from './types.js';

const context = { seed: 4242, width: 540, height: 540 };
const frame = (overrides: Partial<FrameState> = {}): FrameState => ({
  time: 0,
  clock: 0,
  frame: 0,
  inputs: {},
  reducedMotion: false,
  ...overrides,
});
const corner = { 'pointer.x': 1, 'pointer.y': 1 };

const fill = { id: 'fill', name: 'Fill' };
const phone = { id: 'phone', name: 'Phone' };
const title = { id: 'title', name: 'Title' };
const warpLayer = { id: 'warp', name: 'Noise Warp' };
const vortexLayer = { id: 'vortex', name: 'Vortex' };

/** Noise Warp, then a layer that runs Vortex; plates: Fill beneath, Phone and Title together on top. */
const passes: LivePass[] = [
  { effect: 'noiseWarp', layer: { noiseWarp: 40, seedOffset: 0 }, source: warpLayer },
  { effect: 'vortex', layer: { vortex: 20 }, source: vortexLayer },
];
const plates = [
  { depth: 0.5, layers: [fill] },
  { depth: 1, layers: [phone, title] },
];

function compile(bindings: unknown[], options: Partial<LiveChainOptions> = {}) {
  return compileLiveChain({
    passes,
    plates,
    context,
    bindings: { version: 1, loop: { durationSeconds: 4 }, bindings },
    ...options,
  });
}

const issuesOf = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof BindingError || error instanceof LayerOptionsError || error instanceof LivePackageError) {
      return [...error.issues];
    }
    throw error;
  }
  return [];
};

describe('findLayer', () => {
  const layers = [fill, phone, { id: 'phone-2', name: 'Phone' }, { id: 'Fill', name: 'Backdrop' }];

  it('finds a layer by id first, then by a name only one layer has', () => {
    expect(findLayer('fill', layers)).toEqual({ layer: fill });
    // An id wins over another layer's name.
    expect(findLayer('Fill', layers)).toEqual({ layer: { id: 'Fill', name: 'Backdrop' } });
    expect(findLayer('Backdrop', layers)).toEqual({ layer: { id: 'Fill', name: 'Backdrop' } });
  });

  it('reports an ambiguous name with the ids to use, and a missing one with the layers there are', () => {
    expect(findLayer('Phone', layers)).toEqual({ issue: '2 layers are named "Phone" (ids phone, phone-2); use an id' });
    expect(findLayer('Nope', [fill])).toEqual({ issue: 'no layer has the id or name "Nope"; layers: "Fill" (fill)' });
  });
});

describe('layer-addressed binding targets', () => {
  it('resolve a field and a uniform target by layer name or id to that layer’s pass', () => {
    const live = compile([
      { from: { input: 'hover' }, to: { layer: 'Vortex', field: 'vortex' }, range: [20, 80] },
      { from: { input: 'pointer.x' }, to: { layer: 'vortex', uniform: 'uCenter', component: 0 } },
      { from: { track: 'wave' }, to: { layer: 'Noise Warp', field: 'noiseWarp' }, range: [0, 40], mode: 'add' },
    ]);
    const at = (overrides: Partial<FrameState>) => live.frameUniforms(frame(overrides))!;
    const hovered = at({ time: 1, inputs: { hover: 1, 'pointer.x': 0.25 } });
    expect(hovered[1]?.uIntensity).toBeCloseTo(80 * 0.03);
    expect((hovered[1]?.uCenter as number[])[0]).toBeCloseTo(0.25);
    expect(hovered[0]?.uIntensity).toBeCloseTo((40 + 40) * 0.0008);
    expect(live.layers).toEqual([fill, phone, title, warpLayer, vortexLayer]);
  });

  it('resolve a transform target to the plate the layer is drawn into', () => {
    const live = compile([{ from: { input: 'pointer.x' }, to: { layer: 'Title', transform: 'x' }, range: [0, 0.1] }]);
    expect(live.plates.moving).toEqual([1]);
    expect(live.plates.transforms(frame({ inputs: { 'pointer.x': 1 } }))?.[1]?.x).toBeCloseTo(0.1);
  });

  it('pick the effect of a layer that runs several, and ask for one when the field is ambiguous', () => {
    const twoWarps: LivePass[] = [
      { effect: 'noiseWarp', layer: { noiseWarp: 40, seedOffset: 0 }, source: warpLayer },
      { effect: 'vortex', layer: { vortex: 20, seedOffset: 0 }, source: warpLayer },
    ];
    const bindings = (to: Record<string, unknown>) => ({
      version: 1,
      bindings: [{ from: { input: 'hover' }, to }],
    });
    // Only Noise Warp has a noiseWarp field, so the layer is enough.
    expect(() =>
      compileLiveChain({ passes: twoWarps, context, bindings: bindings({ layer: 'warp', field: 'noiseWarp' }) }),
    ).not.toThrow();
    const ambiguous = issuesOf(() =>
      compileLiveChain({ passes: twoWarps, context, bindings: bindings({ layer: 'warp', uniform: 'uIntensity' }) }),
    );
    expect(ambiguous).toEqual([
      'bindings[0].to.uniform: "Noise Warp" (warp) runs several effects with uniform "uIntensity" (noiseWarp, vortex); add "effect" to pick one',
    ]);
    const picked = compileLiveChain({
      passes: twoWarps,
      context,
      bindings: bindings({ layer: 'warp', effect: 'vortex', uniform: 'uIntensity' }),
    });
    expect(picked.frameUniforms(frame({ inputs: { hover: 0.5 } }))?.[1]?.uIntensity).toBe(0.5);
  });

  it('report missing, ambiguous and mismatched layers with their paths', () => {
    const issues = issuesOf(() =>
      compileLiveChain({
        passes,
        plates: [{ depth: 1, layers: [fill, { id: 'fill-2', name: 'Fill' }] }],
        context,
        bindings: {
          version: 1,
          bindings: [
            { from: { input: 'hover' }, to: { layer: 'Nope', field: 'vortex' } },
            { from: { input: 'hover' }, to: { layer: 'Fill', transform: 'x' } },
            { from: { input: 'hover' }, to: { layer: 'fill', field: 'vortex' } },
            { from: { input: 'hover' }, to: { layer: 'Vortex', transform: 'x' } },
            { from: { input: 'hover' }, to: { layer: 'Vortex', field: 'noiseWarp' } },
            { from: { input: 'hover' }, to: { layer: 'Vortex', effect: 'grain', field: 'grain' } },
          ],
        },
      }),
    );
    expect(issues).toEqual([
      expect.stringMatching(/^bindings\[0\]\.to\.layer: no layer has the id or name "Nope"; layers: "Fill" \(fill\)/),
      'bindings[1].to.layer: 2 layers are named "Fill" (ids fill, fill-2); use an id',
      'bindings[2].to.layer: "Fill" (fill) is drawn into a plate; "field" and "uniform" need an effect layer',
      'bindings[3].to.layer: "Vortex" (vortex) is an effect the runtime runs, not drawn into a plate, so it cannot move',
      'bindings[4].to.field: "Vortex" (vortex) (vortex) has no field "noiseWarp"',
      'bindings[5].to.effect: "Vortex" (vortex) runs vortex, not grain',
    ]);
  });

  it('check the shape of a layer target', () => {
    const issues = issuesOf(() =>
      compile([
        { from: { input: 'hover' }, to: { layer: '', field: 'vortex' } },
        { from: { input: 'hover' }, to: { layer: 'Vortex' } },
        { from: { input: 'hover' }, to: { layer: 'Title', transform: 'skew' } },
        { from: { input: 'hover' }, to: { layer: 'Title', transform: 'x', field: 'vortex' } },
      ]),
    );
    expect(issues).toEqual([
      'bindings[0].to.layer: must be a layer id or name, got ""',
      'bindings[1].to: needs exactly one of "field", "uniform" or "transform"',
      'bindings[2].to.transform: must be one of x, y, scale, rotation, opacity, got "skew"',
      'bindings[3].to.field: unknown key; expected one of layer, transform',
    ]);
  });

  it('are checked by parseLivePackage against the package’s layers', () => {
    const manifest = {
      format: LIVE_PACKAGE_FORMAT,
      version: 1,
      size: { width: 540, height: 540 },
      maxRenderSize: 540,
      seed: 4242,
      still: 'still.png',
      stack: [
        { type: 'plate', file: 'plates/0.png', layers: [fill] },
        { type: 'chain', passes },
        { type: 'plate', file: 'plates/2.png', layers: [phone, title] },
      ],
      baked: [],
    };
    const ok = { version: 1, bindings: [{ from: { input: 'pointer.x' }, to: { layer: 'Phone', transform: 'x' } }] };
    const parsed = parseLivePackage({ ...manifest, bindings: ok }) as LivePackageManifest;
    expect(livePackageLayers(parsed)).toEqual([fill, warpLayer, vortexLayer, phone, title]);
    const bad = { version: 1, bindings: [{ from: { input: 'pointer.x' }, to: { layer: 'Screen', transform: 'x' } }] };
    expect(issuesOf(() => parseLivePackage({ ...manifest, bindings: bad }))).toEqual([
      expect.stringMatching(/^bindings\.bindings\[0\]\.to\.layer: no layer has the id or name "Screen"/),
    ]);
  });
});

describe('layer options', () => {
  const bindings = [
    { from: { input: 'pointer.x' }, to: { layer: 'Vortex', uniform: 'uCenter', component: 0 } },
    { from: { input: 'pointer.x' }, to: { layer: 'Noise Warp', field: 'noiseWarp' }, range: [0, 100] },
    { from: { track: 'wave' }, to: { layer: 'Vortex', field: 'vortex' }, range: [0, 40], mode: 'add' },
    { from: { input: 'pointer.x' }, to: { parallax: 'x' }, range: [-0.1, 0.1] },
    { from: { track: 'wave' }, to: { parallax: 'scale' }, range: [0, 0.02] },
  ];
  const resting = compile(bindings).frameUniforms(frame())!;
  const centre = (overrides: readonly (UniformValues | undefined)[] | undefined) =>
    (overrides?.[1]?.uCenter as number[])[0];

  it('drop a layer’s input bindings when it is not interactive, leaving it at its authored values', () => {
    const live = compile(bindings, { layers: { Vortex: { interactive: false } } });
    const moved = live.frameUniforms(frame({ inputs: corner }));
    // Vortex rests at its authored centre; Noise Warp still follows the pointer.
    expect(centre(moved)).toBe(centre(resting));
    expect(moved?.[0]?.uIntensity).toBeCloseTo(100 * 0.0008);
  });

  it('freeze a layer’s time tracks when it is not animated, keeping its inputs', () => {
    const live = compile(bindings, { layers: { vortex: { animated: false } } });
    const later = live.frameUniforms(frame({ time: 1, inputs: corner }));
    // The authored amount, not the bound value at t = 0 (the wave is mid-range there).
    expect(later?.[1]?.uIntensity).toBeCloseTo(20 * 0.03);
    expect(centre(later)).toBeCloseTo(1);
  });

  it('apply defaults to unlisted layers, and a listed layer overrides them', () => {
    const live = compile(bindings, {
      layerDefaults: { interactive: false },
      layers: { Vortex: { interactive: true } },
    });
    const moved = live.frameUniforms(frame({ inputs: corner }));
    expect(centre(moved)).toBeCloseTo(1);
    expect(moved?.[0]?.uIntensity).toBeCloseTo(40 * 0.0008);
    // Every plate's layers are off by default, so parallax leaves the plates at rest.
    expect(live.plates.transforms(frame({ inputs: corner }))?.map((transform) => transform?.x)).toEqual([0, 0]);
  });

  it('move a plate only when every layer drawn into it allows the binding', () => {
    const live = compile(bindings, { layers: { Title: { interactive: false } } });
    const moved = live.plates.transforms(frame({ time: 1, inputs: corner }))!;
    // Phone shares Title's plate, so the pointer moves only the Fill plate; the breathing wave still scales both.
    expect(moved[0]?.x).toBeCloseTo(0.05);
    expect(moved[1]?.x).toBe(0);
    expect(moved[1]?.scale).toBeCloseTo(1.02);
  });

  it('change with setLayerOptions on the next frame, and reject keys that name no layer', () => {
    const live = compile(bindings);
    expect(centre(live.frameUniforms(frame({ inputs: corner })))).toBeCloseTo(1);
    live.setLayerOptions({ layerDefaults: { interactive: false } });
    expect(centre(live.frameUniforms(frame({ inputs: corner })))).toBe(centre(resting));
    live.setLayerOptions({});
    expect(centre(live.frameUniforms(frame({ inputs: corner })))).toBeCloseTo(1);
    expect(issuesOf(() => live.setLayerOptions({ layers: { Screen: { animated: false } } }))).toEqual([
      expect.stringMatching(/^layers\["Screen"\]: no layer has the id or name "Screen"/),
    ]);
    expect(
      issuesOf(() => layerPolicy({ layers: { Title: { moving: false, animated: 'no' } as never } }, [title])),
    ).toEqual([
      'layers["Title"].moving: unknown key; expected interactive, animated',
      'layers["Title"].animated: must be true or false, got "no"',
    ]);
  });
});

describe('createLiveArtwork with layer options', () => {
  const manifest = parseLivePackage({
    format: LIVE_PACKAGE_FORMAT,
    version: 1,
    size: { width: 540, height: 540 },
    maxRenderSize: 540,
    seed: 4242,
    still: 'still.png',
    stack: [
      { type: 'plate', file: 'plates/0.png', layers: [fill] },
      { type: 'chain', passes },
    ],
    bindings: {
      version: 1,
      bindings: [{ from: { input: 'pointer.x' }, to: { layer: 'Vortex', uniform: 'uCenter', component: 0 } }],
    },
    baked: [],
  });
  const livePackage: LivePackage = {
    manifest,
    images: Object.fromEntries(livePackageFiles(manifest).map((file) => [file, {} as ImageBitmap])),
  };

  it('exposes the package’s layers and redraws a stopped artwork when the options change', () => {
    const scheduler = createManualScheduler();
    const artwork = createLiveArtwork({
      canvas: createFakeCanvas(createFakeGl()),
      livePackage,
      reducedMotion: false,
      devicePixelRatio: 1,
      scheduler,
      observeVisibility: null,
      layers: { Vortex: { interactive: false } },
    });
    expect(artwork.layers).toEqual([fill, warpLayer, vortexLayer]);
    const frames = artwork.state.frames;
    artwork.setLayerOptions({});
    expect(artwork.state.frames).toBe(frames + 1);
    expect(() => artwork.setLayerOptions({ layers: { Nope: {} } })).toThrow(LayerOptionsError);
    artwork.destroy();
  });

  it('rejects options for a layer the package does not have at creation', () => {
    expect(() =>
      createLiveArtwork({
        canvas: createFakeCanvas(createFakeGl()),
        livePackage,
        reducedMotion: false,
        devicePixelRatio: 1,
        scheduler: createManualScheduler(),
        observeVisibility: null,
        layers: { Phone: { interactive: false } },
      }),
    ).toThrow(/layers\["Phone"\]: no layer has the id or name "Phone"/);
  });
});
