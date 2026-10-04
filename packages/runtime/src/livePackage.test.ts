import { describe, expect, it } from 'vitest';
import { createArtwork } from './artwork.js';
import { effectRegistry } from './effects/index.js';
import { createLiveArtwork } from './liveArtwork.js';
import {
  LIVE_PACKAGE_FORMAT,
  type LivePackage,
  LivePackageError,
  type LivePackageManifest,
  livePackageComposite,
  livePackageFiles,
  livePackagePasses,
  parseLivePackage,
} from './livePackage.js';
import { createFakeCanvas, createFakeGl, createManualScheduler } from './testing/fakeGl.js';

const warp = (amount: number, id = 'warp') => ({
  effect: 'noiseWarp',
  layer: { noiseWarp: amount, seedOffset: 0 },
  source: { id, name: 'Noise Warp' },
});

/** Base plate, a chain of two warps, an overlay plate, a second chain, and a background. */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: LIVE_PACKAGE_FORMAT,
    version: 1,
    size: { width: 540, height: 540 },
    maxRenderSize: 1080,
    seed: 4242,
    still: 'still.png',
    background: 'background.png',
    stack: [
      { type: 'plate', file: 'plates/0.png', layers: [{ id: 'fill', name: 'Fill' }] },
      { type: 'chain', passes: [warp(40, 'a'), warp(60, 'b')] },
      { type: 'plate', file: 'plates/1.png', layers: [{ id: 'text', name: 'Title' }] },
      { type: 'chain', passes: [warp(20, 'c')] },
    ],
    baked: [{ id: 'glitch', name: 'Glitch', effects: ['glitch'], reason: 'glitch does not run in the runtime yet' }],
    ...overrides,
  };
}

const issuesOf = (value: unknown): string[] => {
  try {
    parseLivePackage(value);
  } catch (error) {
    if (error instanceof LivePackageError) return [...error.issues];
    throw error;
  }
  return [];
};

const images = (parsed: LivePackageManifest): LivePackage['images'] =>
  Object.fromEntries(livePackageFiles(parsed).map((file) => [file, { file } as unknown as ImageBitmap]));

describe('parseLivePackage', () => {
  it('accepts a well-formed manifest and returns it unchanged', () => {
    const value = manifest();
    expect(parseLivePackage(value)).toBe(value);
  });

  it('accepts bindings that target the package passes, counted bottom up across chains', () => {
    const bindings = {
      version: 1,
      loop: { durationSeconds: 4 },
      bindings: [{ from: { track: 'wave' }, to: { pass: 2, field: 'noiseWarp' }, range: [0, 40] }],
    };
    expect(parseLivePackage(manifest({ bindings })).bindings).toEqual(bindings);
  });

  it('lists every problem with its path', () => {
    const issues = issuesOf(
      manifest({
        format: 'zip',
        size: { width: 540.5, height: 0 },
        still: '../still.png',
        extra: true,
        stack: [
          { type: 'chain', passes: [warp(40)] },
          {
            type: 'chain',
            passes: [{ effect: 'bokehBlur', layer: { bokehBlur: 20 }, source: { id: 'b', name: 'Bokeh' } }],
          },
          { type: 'plate', file: 'https://example.com/plate.png', layers: [] },
          { type: 'chain', passes: [warp(0)] },
          { type: 'mask' },
        ],
        baked: [{ id: 'x', name: 'X', effects: 'glitch' }],
      }),
    );
    expect(issues).toEqual([
      'format: must be "artifact-live-package", got "zip"',
      'extra: unknown key; expected one of format, version, size, maxRenderSize, seed, still, background, stack, bindings, baked, fallback',
      'size.width: must be a whole number of pixels, got 540.5',
      'size.height: must be a whole number of pixels, got 0',
      'still: must be a relative path inside the package like "plates/0.png", got "../still.png"',
      'stack[0]: the bottom of the stack must be a plate: a chain needs an image to run on',
      'stack[1]: two chains in a row; merge them into one chain',
      `stack[1].passes[0].effect: unknown effect "bokehBlur"; this runtime runs ${effectRegistry.ids().join(', ')}`,
      'stack[2].file: must be a relative path inside the package like "plates/0.png", got "https://example.com/plate.png"',
      'stack[3].passes[0].layer: noiseWarp is off for these values; the exporter only writes effects that are on',
      'stack[4].type: must be "plate" or "chain", got "mask"',
      'baked[0].effects: must be an array of effect names',
      'baked[0].reason: must say why',
    ]);
  });

  it('says when a package is newer than the runtime', () => {
    expect(issuesOf(manifest({ version: 2 }))).toEqual([
      'version: 2 is newer than this runtime reads (1); update @artifact/runtime',
    ]);
  });

  it('reports binding problems under "bindings." with the package pass count', () => {
    const issues = issuesOf(
      manifest({
        bindings: {
          version: 1,
          bindings: [
            { from: { input: 'hover' }, to: { pass: 3, field: 'noiseWarp' } },
            { from: { input: 'hover' }, to: { pass: 0, field: 'noisewarp' } },
          ],
        },
      }),
    );
    expect(issues).toEqual([
      'bindings.bindings[0].to.pass: there is no pass 3; the chain has 3',
      'bindings.bindings[1].to.field: noiseWarp has no field "noisewarp"; bindable fields: noiseWarp, seedOffset',
    ]);
  });

  it('rejects a non-object', () => {
    expect(issuesOf('manifest')).toEqual(['manifest: must be an object']);
  });
});

describe('package layout', () => {
  const parsed = parseLivePackage(manifest()) as LivePackageManifest;

  it('flattens passes bottom up and lists every image once', () => {
    expect(livePackagePasses(parsed).map((pass) => pass.source.id)).toEqual(['a', 'b', 'c']);
    expect(livePackageFiles(parsed)).toEqual(['plates/0.png', 'plates/1.png', 'background.png', 'still.png']);
  });

  it('composites the overlay plate over the first chain and the background beneath everything', () => {
    const context = { seed: 4242, width: 540, height: 540 };
    const passes = livePackagePasses(parsed).map((pass) => effectRegistry.pass(pass.effect, pass.layer, context)!);
    const composite = livePackageComposite({ manifest: parsed, images: images(parsed) }, passes);
    expect(composite.steps.map((step) => (step.kind === 'pass' ? step.pass.uniforms.uIntensity : step))).toEqual([
      40 * 0.0008,
      60 * 0.0008,
      { kind: 'over', plate: 1 },
      20 * 0.0008,
      { kind: 'under', plate: 2 },
    ]);
    expect(composite.passSteps).toEqual([0, 1, 3]);
    expect(composite.plates).toHaveLength(3);
  });

  it('names a missing image', () => {
    expect(() => livePackageComposite({ manifest: parsed, images: {} }, [])).toThrow(
      'images: the package has no image for "plates/0.png"',
    );
  });
});

describe('artworks from a package', () => {
  const parsed = parseLivePackage(manifest()) as LivePackageManifest;
  const livePackage: LivePackage = { manifest: parsed, images: images(parsed) };

  it('draws one step per pass and plate, the last to the canvas, at the package maxRenderSize', () => {
    const fake = createFakeGl();
    const artwork = createArtwork({
      canvas: createFakeCanvas(fake, 2000, 2000),
      livePackage,
      reducedMotion: true,
      devicePixelRatio: 1,
      observeVisibility: null,
      scheduler: createManualScheduler(),
    });
    expect(fake.counts.draws).toBe(5);
    expect(fake.drawTargets.at(-1)).toBeNull();
    expect(artwork.state).toMatchObject({ width: 1080, height: 1080 });
    artwork.destroy();
    expect(fake.live()).toEqual({});
  });

  it('applies the package bindings to the right pass', () => {
    const fake = createFakeGl();
    const bindings = { version: 1, bindings: [{ from: { input: 'hover' }, to: { pass: 2, field: 'noiseWarp' } }] };
    const artwork = createLiveArtwork({
      canvas: createFakeCanvas(fake),
      livePackage: { ...livePackage, manifest: { ...parsed, bindings: bindings as LivePackageManifest['bindings'] } },
      reducedMotion: false,
      devicePixelRatio: 1,
      observeVisibility: null,
      scheduler: createManualScheduler(),
    });
    const before = fake.counts.draws;
    artwork.setInput('hover', 1);
    expect(fake.counts.draws - before).toBe(5);
    artwork.destroy();
  });

  it('refuses a package with a pass that is off at rest', () => {
    const off = { ...parsed, stack: [parsed.stack[0], { type: 'chain' as const, passes: [warp(0)] }] };
    expect(() =>
      createArtwork({
        canvas: createFakeCanvas(createFakeGl()),
        livePackage: { manifest: off, images: livePackage.images },
        reducedMotion: true,
        observeVisibility: null,
      }),
    ).toThrow('is off at rest');
  });
});
