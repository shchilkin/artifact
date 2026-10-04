import type { EffectCase } from '../../../../../packages/runtime/src/testing/effectCase';
import { EFFECT_PRESETS, type EffectLayer, type EffectPreset, makeEffectPresetLayer } from '../../types/config';
import { EFFECT_SECTION_DEFINITIONS, type EffectControl } from '../node-canvas/inspector/EffectControlSections';

function isEffectPreset(effect: string): effect is EffectPreset {
  return Object.hasOwn(EFFECT_PRESETS, effect);
}

export function catalogueTitle(effect: string): string {
  return isEffectPreset(effect) ? EFFECT_PRESETS[effect].name : effect;
}

/** The editor's inspector controls for an effect's authored fields, in inspector order, one per field. */
export function catalogueControls(effect: string): EffectControl[] {
  if (!isEffectPreset(effect)) return [];
  const seen = new Set<string>();
  const controls: EffectControl[] = [];
  for (const section of EFFECT_SECTION_DEFINITIONS) {
    for (const control of section.controls) {
      if (!control.presets.includes(effect) || seen.has(control.field)) continue;
      seen.add(control.field);
      controls.push(control);
    }
  }
  return controls;
}

/** The editor's preset layer for the effect with the harness case's authored values over it. */
export function catalogueLayer(effect: string, effectCase: EffectCase | undefined): EffectLayer | null {
  if (!isEffectPreset(effect)) return null;
  return { ...makeEffectPresetLayer(effect), ...effectCase?.layer, seedOffset: 0 } as EffectLayer;
}

/** What drives the effect: one entry per bound source (a time track by kind, an input by name), in binding order. */
export function catalogueBindings(effectCase: EffectCase | undefined): string[] {
  const sources = (effectCase?.bindings?.bindings ?? []).map((binding) =>
    'input' in binding.from ? binding.from.input : `${binding.from.track} track`,
  );
  return [...new Set(sources)];
}

export function formatGpuTime(ms: number | null | undefined): string {
  if (ms === undefined) return 'measuring';
  if (ms === null) return 'n/a';
  return `${ms.toFixed(2)} ms`;
}
