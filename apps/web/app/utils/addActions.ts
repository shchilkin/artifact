import type { EffectPreset, LayerKind } from '../types/config';
import type { ArrayPresetId } from './arrayPresets';
import type { NoisePresetId } from './noisePresets';
import type { RepeatPresetId } from './repeatPresets';
import type { TextPresetId } from './textPresets';

export type AddAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'textPreset'; preset: TextPresetId }
  | { kind: 'aiImage' }
  | { kind: 'noisePreset'; preset: NoisePresetId }
  | { kind: 'arrayPreset'; preset: ArrayPresetId }
  | { kind: 'effect'; preset: EffectPreset }
  | { kind: 'merge' }
  | { kind: 'color' }
  | { kind: 'repeat' }
  | { kind: 'repeatPreset'; preset: RepeatPresetId };
