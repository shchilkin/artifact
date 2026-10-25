import { describe, expect, it } from 'vitest';
import { makeEffectEntry, makeEffectLayer } from '../types/effectPresets';
import {
  activeEffectEntries,
  addEffectEntry,
  effectRuns,
  moveEffectEntry,
  removeEffectEntry,
  updateEffectEntry,
} from './effectStack';

function stack(...entries: ReturnType<typeof makeEffectEntry>[]) {
  return makeEffectLayer({ id: 'fx', effects: entries });
}

const grain = makeEffectEntry('grain', { grain: 20 }, 'grain');
const scanlines = makeEffectEntry('scanlines', { scanlines: 30 }, 'scanlines');
const vignette = makeEffectEntry('vignette', { vignette: 40 }, 'vignette');
const blur = makeEffectEntry('blur', { blurAmt: 8 }, 'blur');

describe('effectRuns', () => {
  it('renders a stack in pass order as one Canvas 2D run and one GPU run', () => {
    const runs = effectRuns(stack(scanlines, grain, blur, vignette));
    expect(runs.map((run) => run.pass)).toEqual(['canvas', 'gpu']);
    expect(runs[0].values).toMatchObject({ scanlines: 30, grain: 20, vignette: 0, blurAmt: 0 });
    expect(runs[1].values).toMatchObject({ vignette: 40, blurAmt: 8, grain: 0 });
  });

  it('starts a new run when an entry runs before the previous one in pass order', () => {
    expect(effectRuns(stack(grain, scanlines)).length).toBe(2);
    expect(effectRuns(stack(vignette, blur)).map((run) => run.pass)).toEqual(['gpu', 'gpu']);
    expect(effectRuns(stack(vignette, grain)).map((run) => run.pass)).toEqual(['gpu', 'canvas']);
  });

  it('skips disabled and inactive entries', () => {
    const off = { ...grain, enabled: false };
    const zero = makeEffectEntry('scanlines', { scanlines: 0 }, 'zero');
    expect(activeEffectEntries(stack(off, zero, vignette)).map((entry) => entry.id)).toEqual(['vignette']);
    expect(effectRuns(stack(off, zero))).toEqual([]);
  });
});

describe('effect stack edits', () => {
  const effects = [grain, scanlines, vignette];

  it('patches one entry and keeps its other parameters', () => {
    const next = updateEffectEntry([makeEffectEntry('scanlines', { scanlines: 30, scanlineWidth: 3 }, 's')], 's', {
      params: { scanlines: 50 },
    });
    expect(next[0].params).toEqual({ scanlines: 50, scanlineWidth: 3 });
    expect(updateEffectEntry(effects, 'grain', { enabled: false })[0].enabled).toBe(false);
  });

  it('moves entries within the stack and stops at its ends', () => {
    expect(moveEffectEntry(effects, 'vignette', -1).map((entry) => entry.id)).toEqual([
      'grain',
      'vignette',
      'scanlines',
    ]);
    expect(moveEffectEntry(effects, 'grain', -1).map((entry) => entry.id)).toEqual(['grain', 'scanlines', 'vignette']);
  });

  it('adds and removes entries', () => {
    const added = addEffectEntry(effects, 'bloom', { bloom: 30 }, () => 'bloom');
    expect(added.at(-1)).toEqual({ id: 'bloom', effect: 'bloom', enabled: true, params: { bloom: 30 } });
    expect(removeEffectEntry(added, 'scanlines').map((entry) => entry.id)).toEqual(['grain', 'vignette', 'bloom']);
  });
});
