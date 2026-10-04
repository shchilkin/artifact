import { describe, expect, it } from 'vitest';
import type { FrameState } from './artwork.js';
import { BindingError, compileLiveChain, type LivePass, parseBindings } from './bindings.js';
import { effectRegistry } from './effects/index.js';
import type { UniformValues } from './types.js';

const context = { seed: 5, width: 540, height: 540 };
const warp: LivePass = { effect: 'noiseWarp', layer: { noiseWarp: 50, seedOffset: 2 } };

const frame = (overrides: Partial<FrameState> = {}): FrameState => ({
  time: 0,
  clock: 0,
  frame: 0,
  inputs: {},
  reducedMotion: false,
  ...overrides,
});
const uniformsOf = (overrides: readonly (UniformValues | undefined)[] | undefined, index = 0) => overrides?.[index];

// Vortex is the registered centred effect: an amount field mapped to uIntensity (× 0.03), and uCenter.
const registry = effectRegistry;

describe('bindings resolve into per-pass uniforms', () => {
  it('drives Noise Warp with a wave track through its own uniform mapping, and the loop closes', () => {
    const live = compileLiveChain({
      passes: [warp],
      context,
      bindings: {
        version: 1,
        loop: { durationSeconds: 4 },
        bindings: [{ from: { track: 'wave' }, to: { pass: 0, field: 'noiseWarp' }, range: [-40, 40], mode: 'add' }],
      },
    });
    const intensity = (time: number) => uniformsOf(live.frameUniforms(frame({ time })))?.uIntensity as number;
    expect(intensity(0)).toBeCloseTo(50 * 0.0008);
    expect(intensity(1)).toBeCloseTo(90 * 0.0008);
    expect(intensity(3)).toBeCloseTo(10 * 0.0008);
    expect(intensity(4)).toBe(intensity(0));
    // The seed is untouched: only the bound field changes.
    expect(uniformsOf(live.frameUniforms(frame({ time: 1 })))?.uSeed).toBe(7);
  });

  it('drives Noise Warp with pointer.speed', () => {
    const live = compileLiveChain({
      passes: [{ effect: 'noiseWarp', layer: { noiseWarp: 0 } }],
      context,
      bindings: {
        version: 1,
        bindings: [{ from: { input: 'pointer.speed' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 120] }],
      },
    });
    // Authored at zero the effect would be skipped; bound, it stays in the chain so it can move.
    expect(live.chain).toHaveLength(1);
    expect(live.inputs).toEqual(['pointer.speed']);
    const at = (speed: number) =>
      uniformsOf(live.frameUniforms(frame({ inputs: { 'pointer.speed': speed } })))?.uIntensity as number;
    expect(at(0)).toBe(0);
    expect(at(0.5)).toBeCloseTo(60 * 0.0008);
    expect(at(1)).toBeCloseTo(120 * 0.0008);
    // Without input values the resting inputs apply (speed 0).
    expect(uniformsOf(live.frameUniforms(frame()))?.uIntensity).toBe(0);
  });

  it('adds a step track to the seed field', () => {
    const live = compileLiveChain({
      passes: [warp],
      context,
      bindings: {
        version: 1,
        loop: { durationSeconds: 2 },
        bindings: [{ from: { track: 'step', fps: 5, stride: 7 }, to: { pass: 0, field: 'seedOffset' }, mode: 'add' }],
      },
    });
    const seed = (time: number) => uniformsOf(live.frameUniforms(frame({ time })))?.uSeed;
    expect(seed(0)).toBe(7);
    expect(seed(0.25)).toBe(14);
    expect(seed(1.9)).toBe(7 + 63);
    expect(seed(2)).toBe(7);
  });

  it('switches a pulse on inside its window', () => {
    const live = compileLiveChain({
      passes: [warp],
      context,
      bindings: {
        version: 1,
        loop: { durationSeconds: 1 },
        bindings: [
          { from: { track: 'pulse', at: [0.5], length: 0.2 }, to: { pass: 0, field: 'noiseWarp' }, range: [50, 100] },
        ],
      },
    });
    const intensity = (time: number) => uniformsOf(live.frameUniforms(frame({ time })))?.uIntensity as number;
    expect(intensity(0.4)).toBeCloseTo(50 * 0.0008);
    expect(intensity(0.6)).toBeCloseTo(100 * 0.0008);
  });

  it('sets uCenter components from the pointer and an amount from hover (the Vortex example)', () => {
    const document = {
      version: 1,
      bindings: [
        { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
        { from: { input: 'pointer.y' }, to: { pass: 0, uniform: 'uCenter', component: 1 } },
        { from: { input: 'hover' }, to: { pass: 0, field: 'vortex' }, range: [20, 80], easing: 'easeOut' },
      ],
    };
    const live = compileLiveChain({
      registry,
      passes: [{ effect: 'vortex', layer: { vortex: 20 } }],
      context,
      bindings: JSON.parse(JSON.stringify(document)),
    });
    expect(live.chain[0].uniforms).toEqual({ uCenter: [0.5, 0.5], uIntensity: 0.6 });
    expect(uniformsOf(live.frameUniforms(frame()))).toEqual({ uCenter: [0.5, 0.5], uIntensity: 0.6 });
    const hovering = uniformsOf(
      live.frameUniforms(frame({ inputs: { 'pointer.x': 0.2, 'pointer.y': 0.9, hover: 0.5 } })),
    );
    expect(hovering?.uCenter).toEqual([0.2, 0.9]);
    // easeOut(0.5) = 0.75 → 20 + 60 × 0.75 = 65.
    expect(hovering?.uIntensity).toBeCloseTo(65 * 0.03);
    // The resting pass uniforms are not mutated.
    expect(live.chain[0].uniforms).toEqual({ uCenter: [0.5, 0.5], uIntensity: 0.6 });
  });

  it('applies easing, clamp and direction domains', () => {
    const live = compileLiveChain({
      registry,
      passes: [{ effect: 'vortex', layer: { vortex: 10 } }],
      context,
      bindings: {
        version: 1,
        bindings: [
          { from: { input: 'pointer.dirX' }, to: { pass: 0, field: 'vortex' }, range: [0, 100], easing: 'easeIn' },
          { from: { input: 'click' }, to: { pass: 0, field: 'vortex' }, range: [0, 100], mode: 'add', clamp: [0, 120] },
        ],
      },
    });
    const angle = (inputs: Record<string, number>) =>
      uniformsOf(live.frameUniforms(frame({ inputs })))?.uIntensity as number;
    // dirX 0 is the middle of [-1, 1]: easeIn(0.5) = 0.25.
    expect(angle({ 'pointer.dirX': 0 })).toBeCloseTo(25 * 0.03);
    expect(angle({ 'pointer.dirX': 1, click: 0.1 })).toBeCloseTo(110 * 0.03);
    expect(angle({ 'pointer.dirX': 1, click: 1 })).toBeCloseTo(120 * 0.03);
  });

  it('smooths a binding on the scheduler clock', () => {
    const live = compileLiveChain({
      passes: [warp],
      context,
      bindings: {
        version: 1,
        bindings: [
          { from: { input: 'pointer.x' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 100], smoothing: 0.1 },
        ],
      },
    });
    const at = (clock: number, x: number) =>
      (uniformsOf(live.frameUniforms(frame({ clock, inputs: { 'pointer.x': x } })))?.uIntensity as number) / 0.0008;
    expect(at(0, 0)).toBeCloseTo(0);
    expect(at(100, 1)).toBeCloseTo(100 * (1 - Math.exp(-1)));
    // A redraw at the same clock does not advance the smoothing.
    expect(at(100, 1)).toBeCloseTo(100 * (1 - Math.exp(-1)));
    expect(at(2000, 1)).toBeCloseTo(100, 3);
  });

  it('leaves unbound passes at rest and returns nothing under reduced motion', () => {
    const live = compileLiveChain({
      passes: [
        warp,
        { effect: 'noiseWarp', layer: { noiseWarp: 0 } },
        { effect: 'noiseWarp', layer: { noiseWarp: 30 } },
      ],
      context,
      bindings: {
        version: 1,
        loop: { durationSeconds: 4 },
        bindings: [{ from: { track: 'wave' }, to: { pass: 2, field: 'noiseWarp' }, range: [0, 60] }],
      },
    });
    // The zero-amount, unbound pass is dropped, so pass 2 draws second.
    expect(live.chain).toHaveLength(2);
    const overrides = live.frameUniforms(frame({ time: 1 }));
    expect(overrides?.[0]).toBeUndefined();
    expect(overrides?.[1]?.uIntensity).toBeCloseTo(60 * 0.0008);
    expect(live.frameUniforms(frame({ time: 1, reducedMotion: true }))).toBeUndefined();
    expect(live.frameUniforms(frame({ inputs: { 'pointer.speed': 1 }, reducedMotion: true }))).toBeUndefined();
  });

  it('without bindings, is the resting chain', () => {
    const live = compileLiveChain({ passes: [warp], context });
    expect(live.chain).toHaveLength(1);
    expect(live.frameUniforms(frame({ time: 1 }))).toBeUndefined();
    expect(live.inputs).toEqual([]);
  });
});

describe('binding validation', () => {
  const issuesOf = (run: () => unknown): readonly string[] => {
    try {
      run();
    } catch (error) {
      if (error instanceof BindingError) return error.issues;
      throw error;
    }
    throw new Error('expected a BindingError');
  };

  it('accepts a valid document as plain JSON', () => {
    const document = {
      version: 1,
      loop: { durationSeconds: 4 },
      bindings: [
        { from: { track: 'wave', cycles: 2, phase: 0.25 }, to: { pass: 0, field: 'noiseWarp' }, range: [-10, 10] },
        { from: { input: 'scroll' }, to: { pass: 0, uniform: 'uSeed' }, smoothing: 0.2, easing: 'easeInOut' },
      ],
    };
    expect(parseBindings(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it('reports every structural problem with its path', () => {
    const issues = issuesOf(() =>
      parseBindings({
        version: 2,
        bindings: [
          { from: { track: 'spin' }, to: { pass: 0, field: 'noiseWarp' } },
          { from: { input: 'pointer.z' }, to: { pass: -1, field: 'noiseWarp', uniform: 'uIntensity' } },
          { from: { track: 'wave', cycles: 1.5 }, to: { pass: 0, field: 'noiseWarp' }, rnage: [0, 1] },
          { from: { input: 'hover', track: 'wave' }, to: { pass: 0, field: 'noiseWarp', component: 0 } },
          {
            from: { input: 'hover' },
            to: { pass: 0, uniform: 'uCenter', component: 4 },
            easing: 'bounce',
            smoothing: -1,
            mode: 'multiply',
            clamp: [2, 1],
            range: [0],
          },
        ],
      }),
    );
    expect(issues).toEqual([
      'version: must be 1, got 2',
      'bindings[0].from.track: unknown track "spin"; expected one of wave, step, pulse',
      'bindings[1].from.input: unknown input "pointer.z"; expected one of pointer.x, pointer.y, pointer.speed, pointer.dirX, pointer.dirY, hover, click, click.x, click.y, scroll',
      'bindings[1].to.pass: must be a pass index (0, 1, …), got -1',
      'bindings[1].to: needs exactly one of "field" or "uniform"',
      'bindings[2].rnage: unknown key; expected one of from, to, range, easing, smoothing, mode, clamp',
      'bindings[2].from: time tracks need "loop": { "durationSeconds": … } in the document',
      'bindings[2].from.cycles: must be a whole number ≥ 1 so the loop closes, got 1.5',
      'bindings[3].from: needs exactly one of "input" or "track"',
      'bindings[3].to.component: only applies to uniform targets',
      'bindings[4].to.component: must be 0, 1, 2 or 3, got 4',
      'bindings[4].range: must be [from, to], two finite numbers',
      'bindings[4].easing: must be one of linear, easeIn, easeOut, easeInOut, got "bounce"',
      'bindings[4].smoothing: must be a number of seconds ≥ 0, got -1',
      'bindings[4].mode: must be "set" or "add", got "multiply"',
      'bindings[4].clamp: must be [min, max], two finite numbers with min ≤ max',
    ]);
  });

  it('checks track parameters, including loop closure for steps', () => {
    const issues = issuesOf(() =>
      parseBindings({
        version: 1,
        loop: { durationSeconds: 1.5 },
        bindings: [
          { from: { track: 'step', fps: 5 }, to: { pass: 0, field: 'seedOffset' }, range: [0, 1] },
          { from: { track: 'step', fps: 0 }, to: { pass: 0, field: 'seedOffset' } },
          { from: { track: 'pulse', at: [1.2], length: 0 }, to: { pass: 0, field: 'noiseWarp' } },
          { from: { track: 'pulse', at: [] }, to: { pass: 0, field: 'noiseWarp' } },
        ],
      }),
    );
    expect(issues).toEqual([
      'bindings[0].from.fps: loop.durationSeconds × fps = 7.5 steps; it must be whole so the loop closes',
      'bindings[0].range: a step track is unbounded and cannot be mapped to a range; use its stride',
      'bindings[1].from.fps: must be a positive number, got 0',
      'bindings[2].from.at[0]: must be a loop position in [0, 1), got 1.2',
      'bindings[2].from.length: must be a window length in (0, 1) loop turns, got 0',
      'bindings[3].from.at: must be a non-empty array of loop positions in [0, 1)',
      'bindings[3].from.length: must be a window length in (0, 1) loop turns, got nothing',
    ]);
    expect(issuesOf(() => parseBindings('nope'))).toEqual(['bindings document: must be an object']);
    expect(issuesOf(() => parseBindings({ version: 1, loop: { durationSeconds: 0 }, bindings: {} }))).toEqual([
      'loop.durationSeconds: must be a positive number, got 0',
      'bindings: must be an array',
    ]);
  });

  it('checks targets against the passes and the registry', () => {
    const issues = issuesOf(() =>
      compileLiveChain({
        registry,
        passes: [warp, { effect: 'vortex', layer: { vortex: 10 } }],
        context,
        bindings: {
          version: 1,
          bindings: [
            { from: { input: 'hover' }, to: { pass: 0, field: 'noisewarp' } },
            { from: { input: 'pointer.x' }, to: { pass: 0, uniform: 'uCenter', component: 0 } },
            { from: { input: 'hover' }, to: { pass: 0, uniform: 'uStrength' } },
            { from: { input: 'pointer.x' }, to: { pass: 1, uniform: 'uCenter' } },
            { from: { input: 'pointer.x' }, to: { pass: 1, uniform: 'uCenter', component: 2 } },
            { from: { input: 'hover' }, to: { pass: 1, uniform: 'uIntensity', component: 0 } },
            { from: { input: 'hover' }, to: { pass: 2, field: 'vortex' } },
          ],
        },
      }),
    );
    expect(issues).toEqual([
      'bindings[0].to.field: noiseWarp has no field "noisewarp"; bindable fields: noiseWarp, seedOffset',
      'bindings[1].to.uniform: noiseWarp is not centred, so it has no uCenter',
      'bindings[2].to.uniform: noiseWarp has no uniform "uStrength"; uniforms: uIntensity, uSeed',
      'bindings[3].to.component: uCenter is a vec2; say which component (0–1)',
      'bindings[4].to.component: uCenter is a vec2; component 2 is out of range',
      'bindings[5].to.component: uIntensity is a scalar; remove "component"',
      'bindings[6].to.pass: there is no pass 2; the chain has 2',
    ]);
    expect(issuesOf(() => compileLiveChain({ passes: [{ effect: 'nope', layer: {} }], context }))).toEqual([
      expect.stringMatching(/^passes\[0\]\.effect: unknown effect "nope"; known: .*\bnoiseWarp\b/),
    ]);
  });

  it('formats the issues into a readable message', () => {
    expect(() => parseBindings({ version: 1, bindings: [{ from: { input: 'hover' } }] })).toThrow(
      'Invalid bindings:\n- bindings[0].to: must be { "pass": n, "field" | "uniform": … }, { "plate": n, "transform": … } or { "parallax": … }',
    );
  });
});
