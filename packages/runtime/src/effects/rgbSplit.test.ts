import { HEADER, RGB_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { compileLiveChain } from '../bindings.js';
import { effectRegistry, RGB_SPLIT_OFFSET_FRAG, rgbSplit, rgbSplitDirection } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('rgbSplit', () => {
  it('registers both editor stages: the Canvas 2D port, then the editor GPU fragment by reference', () => {
    expect(effectRegistry.get('rgbSplit')).toBe(rgbSplit);
    expect(rgbSplit.fragment).toBe(RGB_SPLIT_OFFSET_FRAG);
    expect(rgbSplit.fragment.startsWith(HEADER)).toBe(true);
    // Imported from the editor's shared shader source, not a copy.
    expect(rgbSplit.stages).toEqual([RGB_FRAG]);
    expect(rgbSplit.stages?.[0]).toBe(RGB_FRAG);
    expect(rgbSplit.centered).toBe(false);
    expect(rgbSplit.stochastic).toBe(false);
    expect(rgbSplit.fields).toEqual(['rgbSplit', 'rgbSplitDirX', 'rgbSplitDirY']);
  });

  it("maps the authored amount to the editor's uniforms on its diagonal, as one pass with two stages", () => {
    expect(effectRegistry.pass('rgbSplit', { rgbSplit: 8 }, context)).toEqual({
      id: 'rgbSplit',
      fragment: RGB_SPLIT_OFFSET_FRAG,
      stages: [RGB_FRAG],
      uniforms: { uRgbSplit: 8, uRgbSplitDir: [1, 1], uDir: [8 * 0.0006, 8 * 0.0006] },
    });
  });

  it('is off at zero, as in both editor stages', () => {
    expect(effectRegistry.pass('rgbSplit', { rgbSplit: 0 }, context)).toBeNull();
  });

  it("turns to a heading at the diagonal's length, and keeps the diagonal without one", () => {
    expect(rgbSplitDirection({ rgbSplit: 8 })).toEqual([1, 1]);
    expect(rgbSplitDirection({ rgbSplit: 8, rgbSplitDirX: 0, rgbSplitDirY: 0 })).toEqual([1, 1]);
    const [x, y] = rgbSplitDirection({ rgbSplit: 8, rgbSplitDirX: -0.5, rgbSplitDirY: 0 });
    expect(x).toBeCloseTo(-Math.SQRT2);
    expect(y).toBeCloseTo(0);
    const uniforms = rgbSplit.uniforms({ rgbSplit: 10, rgbSplitDirX: 0, rgbSplitDirY: 1 }, context);
    expect((uniforms.uDir as number[])[0]).toBeCloseTo(0);
    expect((uniforms.uDir as number[])[1]).toBeCloseTo(10 * 0.0006 * Math.SQRT2);
  });

  it('lets pointer heading and speed drive both stages through one pass', () => {
    const live = compileLiveChain({
      passes: [{ effect: 'rgbSplit', layer: { rgbSplit: 8 } }],
      context,
      bindings: {
        version: 1,
        bindings: [
          { from: { input: 'pointer.speed' }, to: { pass: 0, field: 'rgbSplit' }, range: [0, 16], mode: 'add' },
          { from: { input: 'pointer.dirX' }, to: { pass: 0, field: 'rgbSplitDirX' } },
          { from: { input: 'pointer.dirY' }, to: { pass: 0, field: 'rgbSplitDirY' } },
        ],
      },
    });
    expect(live.chain).toHaveLength(1);
    expect(live.chain[0].stages).toEqual([RGB_FRAG]);
    const frame = (inputs: Record<string, number>) =>
      live.frameUniforms({ time: 0, frame: 0, clock: 0, inputs, reducedMotion: false })?.[0];
    // At rest the pointer has no heading: the editor's diagonal and the authored amount.
    expect(frame({})).toEqual(rgbSplit.uniforms({ rgbSplit: 8 }, context));
    const moving = frame({ 'pointer.speed': 1, 'pointer.dirX': -1, 'pointer.dirY': 0 })!;
    expect(moving.uRgbSplit).toBe(24);
    expect((moving.uRgbSplitDir as number[])[0]).toBeCloseTo(-Math.SQRT2);
    expect((moving.uDir as number[])[0]).toBeCloseTo(-24 * 0.0006 * Math.SQRT2);
    expect((moving.uDir as number[])[1]).toBeCloseTo(0);
  });
});
