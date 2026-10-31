import { isRecord, type StoredDocument } from './shared';

interface V6Effect {
  effect: string;
  params: readonly string[];
  amounts: readonly string[];
  activation?: 'allPositive' | 'nonzero';
}

/**
 * Schema-6 effects in the order the schema-6 renderer ran them: the Canvas 2D / worker chain, then the GPU filter
 * chain. Frozen here so later catalog changes cannot change what this step produces.
 */
const V6_EFFECTS: readonly V6Effect[] = [
  { effect: 'retroResolution', params: ['retroResolution'], amounts: ['retroResolution'] },
  { effect: 'rays', params: ['rays', 'rayInt', 'rayColor'], amounts: ['rays', 'rayInt'], activation: 'allPositive' },
  { effect: 'glitch', params: ['glitch'], amounts: ['glitch'] },
  {
    effect: 'badStream',
    params: [
      'badStream',
      'badStreamBlockSize',
      'badStreamDetail',
      'badStreamSmear',
      'badStreamChroma',
      'badStreamDarkness',
    ],
    amounts: ['badStream'],
  },
  { effect: 'rgbSplit', params: ['rgbSplit'], amounts: ['rgbSplit'] },
  { effect: 'scanlines', params: ['scanlines', 'scanlineWidth'], amounts: ['scanlines'] },
  { effect: 'grain', params: ['grain'], amounts: ['grain'] },
  {
    effect: 'dotGrain',
    params: ['dotGrain', 'dotGrainSize', 'dotGrainDensity', 'dotGrainJitter'],
    amounts: ['dotGrain'],
  },
  { effect: 'tint', params: ['tint', 'tintOp'], amounts: ['tintOp'] },
  { effect: 'sepia', params: ['sepia'], amounts: ['sepia'] },
  { effect: 'infrared', params: ['infrared'], amounts: ['infrared'] },
  { effect: 'ca', params: ['ca'], amounts: ['ca'] },
  { effect: 'dither', params: ['dither'], amounts: ['dither'] },
  {
    effect: 'indexedPalette',
    params: [
      'indexedPalette',
      'indexedPaletteCount',
      'indexedColorA',
      'indexedColorB',
      'indexedColorC',
      'indexedColorD',
      'indexedColorE',
      'indexedColorF',
    ],
    amounts: ['indexedPalette'],
  },
  {
    effect: 'gradientMap',
    params: ['gradientMap', 'gradientMapShadow', 'gradientMapMid', 'gradientMapHighlight'],
    amounts: ['gradientMap'],
  },
  {
    effect: 'channelMixer',
    params: ['channelMixer', 'channelRedMix', 'channelGreenMix', 'channelBlueMix'],
    amounts: ['channelMixer'],
  },
  { effect: 'edgeCrush', params: ['edgeCrush'], amounts: ['edgeCrush'] },
  { effect: 'silhouetteCrush', params: ['silhouetteCrush'], amounts: ['silhouetteCrush'] },
  {
    effect: 'pixelStretch',
    params: ['pixelStretch', 'pixelStretchLength', 'pixelStretchAngle'],
    amounts: ['pixelStretch'],
  },
  { effect: 'bokehBlur', params: ['bokehBlur', 'bokehThreshold'], amounts: ['bokehBlur'] },
  { effect: 'hatching', params: ['hatching', 'hatchScale', 'hatchAngle'], amounts: ['hatching'] },
  { effect: 'vhsTracking', params: ['vhsTracking'], amounts: ['vhsTracking'] },
  { effect: 'matte', params: ['matte'], amounts: ['matte'] },
  { effect: 'wave', params: ['waveAmt', 'waveFreq'], amounts: ['waveAmt'] },
  { effect: 'zoomBlur', params: ['zoomBlur'], amounts: ['zoomBlur'] },
  { effect: 'neonGlow', params: ['neonGlow', 'neonColor'], amounts: ['neonGlow'] },
  { effect: 'overprint', params: ['overprint'], amounts: ['overprint'] },
  { effect: 'solarize', params: ['solarize'], amounts: ['solarize'] },
  { effect: 'bleachBypass', params: ['bleachBypass'], amounts: ['bleachBypass'] },
  { effect: 'cyanotype', params: ['cyanotype'], amounts: ['cyanotype'] },
  { effect: 'splitTone', params: ['splitToneAmt', 'splitShadow', 'splitHighlight'], amounts: ['splitToneAmt'] },
  { effect: 'ripple', params: ['rippleAmt', 'rippleFreq'], amounts: ['rippleAmt'] },
  {
    effect: 'patternRefraction',
    params: ['patternRefraction', 'patternRefractionScale', 'patternRefractionAngle'],
    amounts: ['patternRefraction'],
  },
  { effect: 'kaleidoscope', params: ['kaleidoscope'], amounts: ['kaleidoscope'] },
  { effect: 'squeeze', params: ['squeezeX', 'squeezeY'], amounts: ['squeezeX', 'squeezeY'], activation: 'nonzero' },
  { effect: 'emboss', params: ['emboss'], amounts: ['emboss'] },
  { effect: 'linocut', params: ['linocut'], amounts: ['linocut'] },
  { effect: 'fog', params: ['fog', 'fogColor'], amounts: ['fog'] },
  { effect: 'gooeyMerge', params: ['gooeyMerge', 'gooeyRadius', 'gooeyThreshold'], amounts: ['gooeyMerge'] },
  { effect: 'speedLines', params: ['speedLines'], amounts: ['speedLines'] },
  { effect: 'mirror', params: ['mirror'], amounts: ['mirror'] },
  { effect: 'dataMosh', params: ['dataMosh'], amounts: ['dataMosh'] },
  { effect: 'interlace', params: ['interlace'], amounts: ['interlace'] },
  { effect: 'noiseWarp', params: ['noiseWarp'], amounts: ['noiseWarp'] },
  { effect: 'morph', params: ['morphAmt', 'morphFreq'], amounts: ['morphAmt'] },
  { effect: 'vortex', params: ['vortex'], amounts: ['vortex'] },
  { effect: 'barrel', params: ['barrel'], amounts: ['barrel'] },
  { effect: 'tear', params: ['tearAmt', 'tearSize'], amounts: ['tearAmt'] },
  { effect: 'pixelate', params: ['pixelate'], amounts: ['pixelate'] },
  { effect: 'posterize', params: ['posterize'], amounts: ['posterize'] },
  { effect: 'hueShift', params: ['hueShift'], amounts: ['hueShift'] },
  { effect: 'duotone', params: ['duotone', 'duoA', 'duoB'], amounts: ['duotone'] },
  { effect: 'halftone', params: ['halftone'], amounts: ['halftone'] },
  { effect: 'risoShift', params: ['risoShift', 'risoAngle'], amounts: ['risoShift'] },
  { effect: 'bloom', params: ['bloom'], amounts: ['bloom'] },
  { effect: 'blur', params: ['blurAmt'], amounts: ['blurAmt'] },
  { effect: 'threshold', params: ['threshold'], amounts: ['threshold'] },
  { effect: 'edgeDetect', params: ['edgeDetect'], amounts: ['edgeDetect'] },
  { effect: 'gradientOverlay', params: ['gradMix', 'gradA', 'gradB', 'gradAngle'], amounts: ['gradMix'] },
  { effect: 'vignette', params: ['vignette'], amounts: ['vignette'] },
  { effect: 'filmBurn', params: ['filmBurn'], amounts: ['filmBurn'] },
];

/** Schema-6 presets that add an effect under another id. */
const V6_PRESET_EFFECTS: Readonly<Record<string, string>> = {
  macroblocks: 'badStream',
  detailBlocks: 'badStream',
  blockSmear: 'badStream',
  chromaBlocks: 'badStream',
  blockDropout: 'badStream',
};

const V6_PARAM_KEYS = V6_EFFECTS.flatMap((item) => item.params);

function amount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isActive(layer: Record<string, unknown>, item: V6Effect): boolean {
  const values = item.amounts.map((key) => amount(layer[key]));
  if (item.activation === 'allPositive') return values.every((value) => value > 0);
  if (item.activation === 'nonzero') return values.some((value) => value !== 0);
  return values.some((value) => value > 0);
}

function presetEffect(preset: unknown): string | null {
  if (typeof preset !== 'string') return null;
  return V6_PRESET_EFFECTS[preset] ?? preset;
}

/** Schema 6 picked Bad Stream's stages from the layer preset; schema 7 stores them on the effect. */
function badStreamStages(preset: unknown): string {
  return typeof preset === 'string' && preset in V6_PRESET_EFFECTS ? preset : 'all';
}

function entryParams(layer: Record<string, unknown>, item: V6Effect): Record<string, unknown> {
  const params = Object.fromEntries(item.params.filter((key) => key in layer).map((key) => [key, layer[key]]));
  return item.effect === 'badStream' ? { ...params, badStreamStages: badStreamStages(layer.preset) } : params;
}

function migrateEffectLayer(layer: Record<string, unknown>): Record<string, unknown> {
  // Documents built in code before they carried a schema version can already hold a stack.
  if (Array.isArray(layer.effects)) return layer;
  const own = presetEffect(layer.preset);
  const layerId = typeof layer.id === 'string' ? layer.id : 'effect';
  const effects = V6_EFFECTS.filter((item) => item.effect === own || isActive(layer, item)).map((item) => ({
    id: `${layerId}-${item.effect}`,
    effect: item.effect,
    enabled: true,
    params: entryParams(layer, item),
  }));
  const rest = Object.fromEntries(Object.entries(layer).filter(([key]) => !V6_PARAM_KEYS.includes(key)));
  return { ...rest, effects, mix: 100 };
}

/**
 * Schema 6 -> 7: an effect layer stops storing every parameter of every effect. It lists the effects it runs, in
 * the order schema 6 ran them, each with its own parameters, so the rendered pixels do not change. An effect is
 * listed when it was active, and the layer's own preset effect is always listed so it stays editable at zero.
 */
export function migrateV6ToV7(raw: StoredDocument): StoredDocument {
  if (!Array.isArray(raw.layers)) return { ...raw, schemaVersion: 7 };
  const layers = raw.layers.map((layer) =>
    isRecord(layer) && layer.kind === 'effect' ? migrateEffectLayer(layer) : layer,
  );
  return { ...raw, schemaVersion: 7, layers };
}
