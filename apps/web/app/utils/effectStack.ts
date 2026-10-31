/**
 * Effect stacks: how an effect layer's ordered entries are rendered, and the pure edits the inspector makes.
 *
 * Each enabled entry becomes the kernel calls its effect makes (`effectSchema.ts`). The renderer's kernels take flat
 * parameter values and run in `KERNEL_PASS_ORDER`, so active calls are cut into runs: consecutive calls of one pass
 * (Canvas 2D / worker, or GPU) whose kernels follow pass order. Each run renders as one call with the run's values,
 * so a stack listed in pass order renders exactly as one flat set of kernel values did, and a stack in any other
 * order still renders top to bottom.
 */
import type { EffectEntry, EffectLayer } from '../types/config';
import {
  isGpuKernel,
  isKernelActive,
  KERNEL_PARAM_DEFAULTS,
  KERNEL_PASS_ORDER,
  type KernelId,
  type KernelParamValues,
  kernelOfPreset,
} from '../types/effectKernels';
import { EFFECT_PRESETS, makeEffectEntry } from '../types/effectPresets';
import { type EffectId, type EffectParams, effectFromKernel, effectSpec } from '../types/effectSchema';

export type EffectPass = 'canvas' | 'gpu';

export interface EffectRun {
  pass: EffectPass;
  /** Every kernel parameter: the run's calls over inactive defaults. */
  values: KernelParamValues;
}

interface ActiveCall {
  kernel: KernelId;
  /** The values the call sets. */
  values: Partial<KernelParamValues>;
}

const PASS_INDEX = new Map(KERNEL_PASS_ORDER.map((kernel, index) => [kernel, index]));

function kernelPass(kernel: KernelId): EffectPass {
  return isGpuKernel(kernel) ? 'gpu' : 'canvas';
}

function activeCalls(entry: EffectEntry): ActiveCall[] {
  if (!entry.enabled) return [];
  return effectSpec(entry.effect)
    .kernels(entry.params)
    .filter((call) => isKernelActive({ ...KERNEL_PARAM_DEFAULTS, ...call.values }, call.kernel));
}

/** Whether an entry changes pixels: enabled, and at least one of its kernel calls active. */
export function isEffectEntryActive(entry: EffectEntry): boolean {
  return activeCalls(entry).length > 0;
}

/** The layer's active kernel calls as render runs, top to bottom. */
export function effectRuns(layer: Pick<EffectLayer, 'effects'>): EffectRun[] {
  const runs: Array<{ pass: EffectPass; lastIndex: number; calls: ActiveCall[] }> = [];
  for (const call of layer.effects.flatMap(activeCalls)) {
    const pass = kernelPass(call.kernel);
    const index = PASS_INDEX.get(call.kernel) ?? 0;
    const run = runs.at(-1);
    if (run && run.pass === pass && index > run.lastIndex) {
      run.calls.push(call);
      run.lastIndex = index;
    } else {
      runs.push({ pass, lastIndex: index, calls: [call] });
    }
  }
  return runs.map((run) => ({ pass: run.pass, values: runValues(run.calls) }));
}

function runValues(calls: readonly ActiveCall[]): KernelParamValues {
  return Object.assign({ ...KERNEL_PARAM_DEFAULTS }, ...calls.map((call) => call.values));
}

export function hasEffectPass(layer: Pick<EffectLayer, 'effects'>, pass: EffectPass): boolean {
  return layer.effects.flatMap(activeCalls).some((call) => kernelPass(call.kernel) === pass);
}

/** The first entry of an effect in the stack. */
export function findEffectEntry(layer: Pick<EffectLayer, 'effects'>, effect: EffectId): EffectEntry | undefined {
  return layer.effects.find((entry) => entry.effect === effect);
}

export function updateEffectEntry(
  effects: readonly EffectEntry[],
  entryId: string,
  patch: { enabled?: boolean; params?: EffectParams },
): EffectEntry[] {
  return effects.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          enabled: patch.enabled ?? entry.enabled,
          params: patch.params ? { ...entry.params, ...patch.params } : entry.params,
        }
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

/** Appends an effect; `createId` is for tests. */
export function addEffectEntry(
  effects: readonly EffectEntry[],
  effect: EffectId,
  params: EffectParams = {},
  createId?: () => string,
): EffectEntry[] {
  return [...effects, makeEffectEntry(effect, params, createId?.())];
}

/**
 * The patch an inspector edit applies. Switching `mode` to one that would leave the effect off (its own amount still
 * at the default) starts that mode from its preset, keeping the entry visible.
 */
export function effectParamsPatch(entry: EffectEntry, patch: EffectParams): EffectParams {
  const mode = patch.mode;
  const preset = typeof mode === 'string' ? effectSpec(entry.effect).modePresets?.[mode] : undefined;
  if (!preset || isEffectEntryActive({ ...entry, params: { ...entry.params, ...patch } })) return patch;
  const kernel = kernelOfPreset(preset);
  const { params } = effectFromKernel(kernel, { ...KERNEL_PARAM_DEFAULTS, ...EFFECT_PRESETS[preset].partial });
  return { ...params, ...patch };
}
