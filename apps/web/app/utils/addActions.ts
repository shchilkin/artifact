import type { EffectPreset, GraphNodeKind, LayerKind, MaterialPreset, ShaderKind, ShaderRole } from '../types/config';
import type { ArrayPresetId } from './arrayPresets';
import type { NoisePresetId } from './noisePresets';
import type { RecipeId } from './recipes';
import type { RepeatPresetId } from './repeatPresets';
import type { TextPresetId } from './textPresets';

export type AddAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'textPreset'; preset: TextPresetId }
  | { kind: 'aiImage' }
  | { kind: 'noisePreset'; preset: NoisePresetId }
  | { kind: 'arrayPreset'; preset: ArrayPresetId }
  | { kind: 'effect'; preset: EffectPreset }
  | { kind: Exclude<GraphNodeKind, 'material' | 'shader'> }
  | { kind: 'material'; preset?: MaterialPreset }
  | { kind: 'repeatPreset'; preset: RepeatPresetId }
  | { kind: 'shader'; shaderKind?: ShaderKind; role: ShaderRole }
  | { kind: 'recipe'; recipe: RecipeId };
