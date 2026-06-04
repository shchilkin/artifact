import { EFFECT_PRESETS, type EffectLayer, type EffectPreset, makeEffectPresetLayer } from '../types/config';

const LEGACY_COMBINED_PRESETS = new Set(['warp', 'color', 'riso']);

type EffectField = keyof EffectLayer;

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
  { preset: 'interlace', active: ['interlace'], copy: ['interlace'] },
  { preset: 'pixelate', active: ['pixelate'], copy: ['pixelate'] },
  { preset: 'hueShift', active: ['hueShift'], copy: ['hueShift'] },
  { preset: 'vignette', active: ['vignette'], copy: ['vignette'] },
  { preset: 'bloom', active: ['bloom'], copy: ['bloom'] },
  { preset: 'posterize', active: ['posterize'], copy: ['posterize'] },
  { preset: 'filmBurn', active: ['filmBurn'], copy: ['filmBurn'] },
  { preset: 'duotone', active: ['duotone'], copy: ['duotone', 'duoA', 'duoB'] },
  { preset: 'halftone', active: ['halftone'], copy: ['halftone'] },
  { preset: 'risoShift', active: ['risoShift'], copy: ['risoShift', 'risoAngle'] },
  { preset: 'blur', active: ['blurAmt'], copy: ['blurAmt'] },
  { preset: 'threshold', active: ['threshold'], copy: ['threshold'] },
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

function hasActiveValue(layer: Partial<EffectLayer>, keys: EffectField[]): boolean {
  return keys.some((key) => numericValue(layer[key]) !== 0);
}

function copyPresetFields(source: Partial<EffectLayer>, rule: SplitRule): Partial<EffectLayer> {
  const patch: Partial<EffectLayer> = {};
  for (const key of rule.copy) {
    if (source[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = source[key];
    }
  }
  if (source.maskAlpha !== undefined) patch.maskAlpha = source.maskAlpha;
  if (source.seedOffset !== undefined) patch.seedOffset = source.seedOffset;
  return patch;
}

function isFocusedPreset(value: unknown): value is EffectPreset {
  return typeof value === 'string' && value in EFFECT_PRESETS;
}

export function splitEffectPatchIntoPresetLayers(
  source: Partial<EffectLayer>,
  options: { idPrefix?: string } = {},
): EffectLayer[] {
  return SPLIT_RULES.filter((rule) => hasActiveValue(source, rule.active)).map((rule, index) => {
    const layer = makeEffectPresetLayer(rule.preset, copyPresetFields(source, rule));
    return {
      ...layer,
      id: options.idPrefix ? `${options.idPrefix}-${rule.preset}-${index}` : layer.id,
      visible: source.visible ?? layer.visible,
      locked: source.locked ?? layer.locked,
    };
  });
}

export function shouldSplitEffectLayer(layer: Partial<EffectLayer>): boolean {
  if (LEGACY_COMBINED_PRESETS.has(String(layer.preset))) return true;
  const activeRules = SPLIT_RULES.filter((rule) => hasActiveValue(layer, rule.active));
  if (!isFocusedPreset(layer.preset)) return activeRules.length > 0;
  return activeRules.some((rule) => rule.preset !== layer.preset);
}
