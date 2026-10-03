import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from '../../types/config';
import {
  applyCoverMotionFrame,
  type CoverMotionRecipe,
  coverMotionFrameCount,
  coverMotionFrameTime,
  parseCoverMotionRecipe,
} from './coverMotion';

const doc = {
  global: { seed: 1, aspect: '1:1', bg: '#000000' },
  layers: [
    { id: 'warp', kind: 'effect', noiseWarp: 100, seedOffset: 10 },
    { id: 'grain', kind: 'effect', grain: 100 },
    { id: 'text', kind: 'text', content: 'A' },
  ],
} as unknown as CanvasDocument;

function layer(result: CanvasDocument, id: string) {
  return result.layers.find((item) => item.id === id) as unknown as Record<string, number>;
}

const recipe: CoverMotionRecipe = {
  version: 1,
  durationSeconds: 2,
  fps: 10,
  tracks: [
    { layerId: 'warp', property: 'seedOffset', kind: 'wave', amplitude: 100 },
    { layerId: 'grain', property: 'seedOffset', kind: 'step', fps: 5, stride: 7 },
    { layerId: 'grain', property: 'grain', kind: 'pulse', at: [0.5], length: 0.1, amplitude: 50, max: 120 },
  ],
};

describe('cover motion', () => {
  it('counts frames and wraps frame times', () => {
    expect(coverMotionFrameCount(recipe)).toBe(20);
    expect(coverMotionFrameTime(recipe, 5)).toBe(0.25);
    expect(coverMotionFrameTime(recipe, 20)).toBe(0);
  });

  it('oscillates around the authored value and closes the loop', () => {
    expect(layer(applyCoverMotionFrame(doc, recipe, 0), 'warp').seedOffset).toBeCloseTo(10);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.25), 'warp').seedOffset).toBeCloseTo(110);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.75), 'warp').seedOffset).toBeCloseTo(-90);
  });

  it('steps seeds at the track rate, treating a missing field as zero', () => {
    expect(layer(applyCoverMotionFrame(doc, recipe, 0), 'grain').seedOffset).toBe(0);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.05), 'grain').seedOffset).toBe(0);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.1), 'grain').seedOffset).toBe(7);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.95), 'grain').seedOffset).toBe(63);
  });

  it('adds pulses only inside their window and respects clamps', () => {
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.45), 'grain').grain).toBe(100);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.55), 'grain').grain).toBe(120);
    expect(layer(applyCoverMotionFrame(doc, recipe, 0.65), 'grain').grain).toBe(100);
  });

  it('leaves untracked layers and the source document untouched', () => {
    const result = applyCoverMotionFrame(doc, recipe, 0.25);
    expect(result.layers[2]).toBe(doc.layers[2]);
    expect(layer(doc, 'warp').seedOffset).toBe(10);
  });

  it('rejects malformed recipes', () => {
    expect(() => parseCoverMotionRecipe({ version: 2 })).toThrow();
    expect(() =>
      parseCoverMotionRecipe({ ...recipe, tracks: [{ layerId: 'a', property: 'b', kind: 'spin' }] }),
    ).toThrow();
    expect(parseCoverMotionRecipe(recipe)).toBe(recipe);
  });
});
