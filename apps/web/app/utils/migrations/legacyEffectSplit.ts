/**
 * The schema 3 -> 4 split of combined effect layers into focused preset layers, frozen as it was when that
 * migration shipped. Current code splits through `effectPresetPatch.ts`, which derives its rules from the effect
 * parameter schema; do not change these rules when the schema changes.
 */
import { EFFECT_PRESETS, type EffectPreset } from '../../types/config';

/** A schema-4 effect layer: every effect parameter as a field on the layer. */
export type StoredEffectLayer = Record<string, unknown>;

type EffectField = string;

interface SplitRule {
  preset: EffectPreset;
  active: EffectField[];
  copy: EffectField[];
}

const SPLIT_RULES: SplitRule[] = [
  { preset: 'rays', active: ['rays', 'rayInt'], copy: ['rays', 'rayInt', 'rayColor'] },
  { preset: 'glitch', active: ['glitch'], copy: ['glitch'] },
  { preset: 'rgbSplit', active: ['rgbSplit'], copy: ['rgbSplit'] },
  { preset: 'scanlines', active: ['scanlines'], copy: ['scanlines', 'scanlineWidth'] },
  { preset: 'grain', active: ['grain'], copy: ['grain'] },
  {
    preset: 'dotGrain',
    active: ['dotGrain'],
    copy: ['dotGrain', 'dotGrainSize', 'dotGrainDensity', 'dotGrainJitter'],
  },
  { preset: 'tint', active: ['tintOp'], copy: ['tint', 'tintOp'] },
  { preset: 'sepia', active: ['sepia'], copy: ['sepia'] },
  { preset: 'infrared', active: ['infrared'], copy: ['infrared'] },
  { preset: 'ca', active: ['ca'], copy: ['ca'] },
  { preset: 'dither', active: ['dither'], copy: ['dither'] },
  { preset: 'morph', active: ['morphAmt'], copy: ['morphAmt', 'morphFreq'] },
  { preset: 'tear', active: ['tearAmt'], copy: ['tearAmt', 'tearSize'] },
  { preset: 'noiseWarp', active: ['noiseWarp'], copy: ['noiseWarp'] },
  { preset: 'vortex', active: ['vortex'], copy: ['vortex'] },
  { preset: 'barrel', active: ['barrel'], copy: ['barrel'] },
  { preset: 'mirror', active: ['mirror'], copy: ['mirror'] },
  { preset: 'dataMosh', active: ['dataMosh'], copy: ['dataMosh'] },
  {
    preset: 'badStream',
    active: ['badStream'],
    copy: [
      'badStream',
      'badStreamBlockSize',
      'badStreamDetail',
      'badStreamSmear',
      'badStreamChroma',
      'badStreamDarkness',
    ],
  },
  { preset: 'interlace', active: ['interlace'], copy: ['interlace'] },
  {
    preset: 'pixelStretch',
    active: ['pixelStretch'],
    copy: ['pixelStretch', 'pixelStretchLength', 'pixelStretchAngle'],
  },
  { preset: 'retroResolution', active: ['retroResolution'], copy: ['retroResolution'] },
  { preset: 'pixelate', active: ['pixelate'], copy: ['pixelate'] },
  { preset: 'hueShift', active: ['hueShift'], copy: ['hueShift'] },
  { preset: 'vignette', active: ['vignette'], copy: ['vignette'] },
  { preset: 'bloom', active: ['bloom'], copy: ['bloom'] },
  { preset: 'posterize', active: ['posterize'], copy: ['posterize'] },
  {
    preset: 'indexedPalette',
    active: ['indexedPalette'],
    copy: [
      'indexedPalette',
      'indexedPaletteCount',
      'indexedColorA',
      'indexedColorB',
      'indexedColorC',
      'indexedColorD',
      'indexedColorE',
      'indexedColorF',
    ],
  },
  {
    preset: 'gradientMap',
    active: ['gradientMap'],
    copy: ['gradientMap', 'gradientMapShadow', 'gradientMapMid', 'gradientMapHighlight'],
  },
  {
    preset: 'channelMixer',
    active: ['channelMixer'],
    copy: ['channelMixer', 'channelRedMix', 'channelGreenMix', 'channelBlueMix'],
  },
  { preset: 'filmBurn', active: ['filmBurn'], copy: ['filmBurn'] },
  { preset: 'duotone', active: ['duotone'], copy: ['duotone', 'duoA', 'duoB'] },
  { preset: 'halftone', active: ['halftone'], copy: ['halftone'] },
  { preset: 'risoShift', active: ['risoShift'], copy: ['risoShift', 'risoAngle'] },
  { preset: 'blur', active: ['blurAmt'], copy: ['blurAmt'] },
  { preset: 'threshold', active: ['threshold'], copy: ['threshold'] },
  { preset: 'edgeCrush', active: ['edgeCrush'], copy: ['edgeCrush'] },
  { preset: 'silhouetteCrush', active: ['silhouetteCrush'], copy: ['silhouetteCrush'] },
  { preset: 'bokehBlur', active: ['bokehBlur'], copy: ['bokehBlur', 'bokehThreshold'] },
  { preset: 'hatching', active: ['hatching'], copy: ['hatching', 'hatchScale', 'hatchAngle'] },
  { preset: 'gooeyMerge', active: ['gooeyMerge'], copy: ['gooeyMerge', 'gooeyRadius', 'gooeyThreshold'] },
  { preset: 'edgeDetect', active: ['edgeDetect'], copy: ['edgeDetect'] },
  { preset: 'gradientOverlay', active: ['gradMix'], copy: ['gradMix', 'gradA', 'gradB', 'gradAngle'] },
  { preset: 'neonGlow', active: ['neonGlow'], copy: ['neonGlow', 'neonColor'] },
  { preset: 'zoomBlur', active: ['zoomBlur'], copy: ['zoomBlur'] },
  { preset: 'vhsTracking', active: ['vhsTracking'], copy: ['vhsTracking'] },
  { preset: 'wave', active: ['waveAmt'], copy: ['waveAmt', 'waveFreq'] },
  { preset: 'matte', active: ['matte'], copy: ['matte'] },
  { preset: 'overprint', active: ['overprint'], copy: ['overprint'] },
  { preset: 'solarize', active: ['solarize'], copy: ['solarize'] },
  { preset: 'bleachBypass', active: ['bleachBypass'], copy: ['bleachBypass'] },
  { preset: 'cyanotype', active: ['cyanotype'], copy: ['cyanotype'] },
  { preset: 'splitTone', active: ['splitToneAmt'], copy: ['splitToneAmt', 'splitShadow', 'splitHighlight'] },
  { preset: 'ripple', active: ['rippleAmt'], copy: ['rippleAmt', 'rippleFreq'] },
  {
    preset: 'patternRefraction',
    active: ['patternRefraction'],
    copy: ['patternRefraction', 'patternRefractionScale', 'patternRefractionAngle'],
  },
  { preset: 'kaleidoscope', active: ['kaleidoscope'], copy: ['kaleidoscope'] },
  { preset: 'squeeze', active: ['squeezeX', 'squeezeY'], copy: ['squeezeX', 'squeezeY'] },
  { preset: 'emboss', active: ['emboss'], copy: ['emboss'] },
  { preset: 'linocut', active: ['linocut'], copy: ['linocut'] },
  { preset: 'fog', active: ['fog'], copy: ['fog', 'fogColor'] },
  { preset: 'speedLines', active: ['speedLines'], copy: ['speedLines'] },
];

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasActiveValue(layer: StoredEffectLayer, keys: EffectField[]): boolean {
  return keys.some((key) => numericValue(layer[key]) !== 0);
}

function copyPresetFields(source: StoredEffectLayer, rule: SplitRule): StoredEffectLayer {
  const patch: StoredEffectLayer = {};
  for (const key of rule.copy) {
    if (source[key] !== undefined) patch[key] = source[key];
  }
  if (source.maskAlpha !== undefined) patch.maskAlpha = source.maskAlpha;
  if (source.seedOffset !== undefined) patch.seedOffset = source.seedOffset;
  return patch;
}

/** Presets whose fields are active (non-zero) in the patch, in rule order. */
export function activeEffectPatchPresets(patch: StoredEffectLayer): EffectPreset[] {
  return SPLIT_RULES.filter((rule) => hasActiveValue(patch, rule.active)).map((rule) => rule.preset);
}

/** A schema-4 focused preset layer: the preset's values, then the copied fields. Absent parameters are defaults. */
function presetLayer(preset: EffectPreset, fields: StoredEffectLayer): StoredEffectLayer {
  const { name, partial } = EFFECT_PRESETS[preset];
  const { badStreamStages, ...presetValues } = partial;
  void badStreamStages;
  return {
    name,
    visible: true,
    locked: false,
    kind: 'effect',
    maskAlpha: false,
    seedOffset: 0,
    ...presetValues,
    ...fields,
    preset,
  };
}

export function splitEffectPatchIntoPresetLayers(
  source: StoredEffectLayer,
  options: { idPrefix?: string } = {},
): StoredEffectLayer[] {
  return SPLIT_RULES.filter((rule) => hasActiveValue(source, rule.active)).map((rule, index) => ({
    ...presetLayer(rule.preset, copyPresetFields(source, rule)),
    id: `${options.idPrefix ?? 'effect'}-${rule.preset}-${index}`,
    visible: source.visible ?? true,
    locked: source.locked ?? false,
    ...(source.blendMode ? { blendMode: source.blendMode } : {}),
  }));
}
