/**
 * Effect stacks: how an effect layer's ordered entries are rendered, and the pure edits the inspector makes.
 *
 * The renderer's kernels take flat parameter values and run their effects in `EFFECT_PASS_ORDER`. A stack is cut
 * into runs: consecutive enabled entries of one pass (Canvas 2D / worker, or GPU) whose effects follow pass order.
 * Each run renders as one call with the run's values, so a stack listed in pass order renders exactly as one flat
 * set of values did, and a stack in any other order still renders top to bottom.
 */
import type { EffectEntry, EffectLayer } from '../types/config';
import { makeEffectEntry } from '../types/effectPresets';
import {
  EFFECT_PARAM_DEFAULTS,
  EFFECT_PASS_ORDER,
  type EffectId,
  type EffectParamValues,
  isEffectActive,
  isGpuEffect,
} from '../types/effectSchema';

export type EffectPass = 'canvas' | 'gpu';

export interface EffectRun {
  pass: EffectPass;
  /** Every parameter: the run's entries over inactive defaults. */
  values: EffectParamValues;
}

const PASS_INDEX = new Map(EFFECT_PASS_ORDER.map((effect, index) => [effect, index]));

function effectPass(effect: EffectId): EffectPass {
  return isGpuEffect(effect) ? 'gpu' : 'canvas';
}

/** Entries that change pixels: enabled, with their effect active. */
export function activeEffectEntries(layer: Pick<EffectLayer, 'effects'>): EffectEntry[] {
  return layer.effects.filter((entry) => entry.enabled && isEffectActive(entry.params, entry.effect));
}

/** The layer's active entries as render runs, top to bottom. */
export function effectRuns(layer: Pick<EffectLayer, 'effects'>): EffectRun[] {
  const runs: Array<{ pass: EffectPass; lastIndex: number; entries: EffectEntry[] }> = [];
  for (const entry of activeEffectEntries(layer)) {
    const pass = effectPass(entry.effect);
    const index = PASS_INDEX.get(entry.effect) ?? 0;
    const run = runs.at(-1);
    if (run && run.pass === pass && index > run.lastIndex) {
      run.entries.push(entry);
      run.lastIndex = index;
    } else {
      runs.push({ pass, lastIndex: index, entries: [entry] });
    }
  }
  return runs.map((run) => ({ pass: run.pass, values: effectRunValues(run.entries) }));
}

function effectRunValues(entries: readonly EffectEntry[]): EffectParamValues {
  return Object.assign({ ...EFFECT_PARAM_DEFAULTS }, ...entries.map((entry) => entry.params));
}

export function hasEffectPass(layer: Pick<EffectLayer, 'effects'>, pass: EffectPass): boolean {
  return activeEffectEntries(layer).some((entry) => effectPass(entry.effect) === pass);
}

/** The first entry of an effect in the stack. */
export function findEffectEntry(layer: Pick<EffectLayer, 'effects'>, effect: EffectId): EffectEntry | undefined {
  return layer.effects.find((entry) => entry.effect === effect);
}

export function updateEffectEntry(
  effects: readonly EffectEntry[],
  entryId: string,
  patch: Partial<Pick<EffectEntry, 'enabled' | 'params'>>,
): EffectEntry[] {
  return effects.map((entry) =>
    entry.id === entryId
      ? { ...entry, ...patch, params: patch.params ? { ...entry.params, ...patch.params } : entry.params }
      : entry,
  );
}

export function moveEffectEntry(effects: readonly EffectEntry[], entryId: string, delta: -1 | 1): EffectEntry[] {
  const from = effects.findIndex((entry) => entry.id === entryId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= effects.length) return [...effects];
  const next = [...effects];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

export function removeEffectEntry(effects: readonly EffectEntry[], entryId: string): EffectEntry[] {
  return effects.filter((entry) => entry.id !== entryId);
}

/** Appends an effect at its default settings; `createId` is for tests. */
export function addEffectEntry(
  effects: readonly EffectEntry[],
  effect: EffectId,
  params: Partial<EffectParamValues> = {},
  createId?: () => string,
): EffectEntry[] {
  return [...effects, makeEffectEntry(effect, params, createId?.())];
}
