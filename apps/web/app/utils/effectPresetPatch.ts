/**
 * Builds focused effect preset layers from a multi-effect patch, for authoring code that describes a look as one
 * set of effect fields (landing hero frames, effect thumbnails). Each effect in the parameter schema owns its
 * fields; a patch gets one preset layer per effect with a non-zero amount, in schema order.
 */
import { type EffectLayer, makeEffectPresetLayer } from '../types/config';
import { EFFECT_IDS, type EffectId, effectDefinition, effectParamKeys } from '../types/effectSchema';

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasActiveValue(patch: Partial<EffectLayer>, effect: EffectId): boolean {
  return effectDefinition(effect).amounts.some((key) => numericValue(patch[key as keyof EffectLayer]) !== 0);
}

function copyEffectFields(source: Partial<EffectLayer>, effect: EffectId): Partial<EffectLayer> {
  const patch: Partial<EffectLayer> = {};
  for (const key of effectParamKeys(effect)) {
    if (source[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = source[key];
    }
  }
  if (source.maskAlpha !== undefined) patch.maskAlpha = source.maskAlpha;
  if (source.seedOffset !== undefined) patch.seedOffset = source.seedOffset;
  return patch;
}

function activeEffects(patch: Partial<EffectLayer>): EffectId[] {
  return EFFECT_IDS.filter((effect) => hasActiveValue(patch, effect));
}

export function splitEffectPatchIntoPresetLayers(
  source: Partial<EffectLayer>,
  options: { idPrefix?: string } = {},
): EffectLayer[] {
  return activeEffects(source).map((effect, index) => {
    const layer = makeEffectPresetLayer(effect, copyEffectFields(source, effect));
    return {
      ...layer,
      id: options.idPrefix ? `${options.idPrefix}-${effect}-${index}` : layer.id,
      visible: source.visible ?? layer.visible,
      locked: source.locked ?? layer.locked,
      ...(source.blendMode ? { blendMode: source.blendMode } : {}),
    };
  });
}
