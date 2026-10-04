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

/** What drives the effect between frames: `time` when a frame samples t > 0, plus every input a frame sets. */
export function catalogueBindings(effectCase: EffectCase | undefined): string[] {
  if (!effectCase?.frameUniforms) return [];
  const frames = effectCase.frames ?? [];
  const inputs = new Set<string>();
  for (const frame of frames) for (const name of Object.keys(frame.input ?? {})) inputs.add(name);
  return [...(frames.some((frame) => frame.t > 0) ? ['time'] : []), ...[...inputs].sort()];
}

/** Pointer speed in CSS pixels per millisecond that maps to `pointer.speed = 1`. */
const FULL_SPEED_PX_PER_MS = 2;

/** Pointer inputs for a position inside a `width` × `height` box, `pointer.x/y` in 0..1 from the top left. */
export function pointerInputs(
  x: number,
  y: number,
  width: number,
  height: number,
  speedPxPerMs: number,
): Record<'pointer.x' | 'pointer.y' | 'pointer.speed', number> {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    'pointer.x': width > 0 ? clamp(x / width) : 0.5,
    'pointer.y': height > 0 ? clamp(y / height) : 0.5,
    'pointer.speed': clamp(speedPxPerMs / FULL_SPEED_PX_PER_MS),
  };
}

export function formatGpuTime(ms: number | null | undefined): string {
  if (ms === undefined) return 'measuring';
  if (ms === null) return 'n/a';
  return `${ms.toFixed(2)} ms`;
}
