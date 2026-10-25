/**
 * Builds focused effect preset layers from a multi-effect patch, for authoring code that describes a look as one
 * set of effect fields (landing hero frames, effect thumbnails). Each effect in the parameter schema owns its
 * fields; a patch gets one preset layer per effect with a non-zero amount, in schema order.
 */
import { type EffectLayer, type EffectLayerInit, makeEffectPresetLayer } from '../types/config';
import {
  EFFECT_IDS,
  type EffectId,
  type EffectParamKey,
  effectDefinition,
  effectParamKeys,
} from '../types/effectSchema';

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasActiveValue(patch: EffectLayerInit, effect: EffectId): boolean {
  return effectDefinition(effect).amounts.some((key) => numericValue(patch[key as EffectParamKey]) !== 0);
}

function copyEffectFields(source: EffectLayerInit, effect: EffectId): EffectLayerInit {
  const patch: Record<string, unknown> = {};
  for (const key of effectParamKeys(effect)) {
    if (source[key] !== undefined) patch[key] = source[key];
  }
  if (source.maskAlpha !== undefined) patch.maskAlpha = source.maskAlpha;
  if (source.seedOffset !== undefined) patch.seedOffset = source.seedOffset;
  return patch;
}

function activeEffects(patch: EffectLayerInit): EffectId[] {
  return EFFECT_IDS.filter((effect) => hasActiveValue(patch, effect));
}

export function splitEffectPatchIntoPresetLayers(
  source: EffectLayerInit,
  options: { idPrefix?: string } = {},
): EffectLayer[] {
  return activeEffects(source).map((effect, index) => {
    const id = options.idPrefix ? `${options.idPrefix}-${effect}-${index}` : undefined;
    const layer = makeEffectPresetLayer(effect, { ...copyEffectFields(source, effect), ...(id ? { id } : {}) });
    return {
      ...layer,
      visible: source.visible ?? layer.visible,
      locked: source.locked ?? layer.locked,
      ...(source.blendMode ? { blendMode: source.blendMode } : {}),
    };
  });
}
