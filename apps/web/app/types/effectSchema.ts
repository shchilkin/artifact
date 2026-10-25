/**
 * The effect parameter schema: every `EffectLayer` parameter, the render effect that owns it, and how the editor
 * shows it. Defaults, zero values, backend activation lists, inspector controls, preset splitting, and effect
 * docs ranges are derived from these tables. Pixels come from the effect's render
 * code (`utils/render/layers/index.ts`, `utils/render/workers/effectPixelTransform.ts`, `utils/pixiFilters.ts`).
 *
 * This module is a leaf: it imports only types.
 */
import type { EffectPreset } from './config';

/** Where an effect's pixels are made: the main-thread Canvas 2D pass, the pixel worker, or the PixiJS filter pass. */
export type EffectBackend = 'canvas' | 'worker' | 'gpu';
/** When an effect runs: any amount above zero, any amount not zero, or every amount above zero. */
export type EffectActivation = 'positive' | 'nonzero' | 'allPositive';
export type EffectFamilyId = 'light' | 'signal' | 'texture' | 'warp' | 'tone' | 'print';
export type EffectSliderValueFormat = 'number' | 'percent' | 'px' | 'deg' | 'bands' | 'steps';

export interface EffectDefinition {
  backend: EffectBackend;
  /** Parameters whose value turns the effect on. Preset splitting treats any non-zero amount as active. */
  amounts: readonly string[];
  /** Defaults to `positive`. */
  activation?: EffectActivation;
  family?: EffectFamilyId;
}

/**
 * Render effects, keyed by the focused preset that adds them. Order is the order a multi-effect patch splits into
 * preset layers (`splitEffectPatchIntoPresetLayers`).
 */
export const EFFECTS = {
  rays: { backend: 'canvas', amounts: ['rays', 'rayInt'], activation: 'allPositive', family: 'light' },
  glitch: { backend: 'canvas', amounts: ['glitch'], family: 'signal' },
  rgbSplit: { backend: 'worker', amounts: ['rgbSplit'], family: 'signal' },
  scanlines: { backend: 'canvas', amounts: ['scanlines'], family: 'texture' },
  grain: { backend: 'canvas', amounts: ['grain'], family: 'texture' },
  dotGrain: { backend: 'canvas', amounts: ['dotGrain'], family: 'texture' },
  tint: { backend: 'canvas', amounts: ['tintOp'], family: 'tone' },
  sepia: { backend: 'worker', amounts: ['sepia'], family: 'tone' },
  infrared: { backend: 'worker', amounts: ['infrared'], family: 'tone' },
  ca: { backend: 'worker', amounts: ['ca'], family: 'signal' },
  dither: { backend: 'worker', amounts: ['dither'], family: 'texture' },
  morph: { backend: 'gpu', amounts: ['morphAmt'], family: 'warp' },
  tear: { backend: 'gpu', amounts: ['tearAmt'], family: 'warp' },
  noiseWarp: { backend: 'gpu', amounts: ['noiseWarp'], family: 'warp' },
  vortex: { backend: 'gpu', amounts: ['vortex'], family: 'warp' },
  barrel: { backend: 'gpu', amounts: ['barrel'], family: 'warp' },
  mirror: { backend: 'gpu', amounts: ['mirror'], family: 'warp' },
  dataMosh: { backend: 'gpu', amounts: ['dataMosh'], family: 'signal' },
  badStream: { backend: 'canvas', amounts: ['badStream'] },
  interlace: { backend: 'gpu', amounts: ['interlace'], family: 'signal' },
  pixelStretch: { backend: 'worker', amounts: ['pixelStretch'], family: 'signal' },
  retroResolution: { backend: 'canvas', amounts: ['retroResolution'], family: 'tone' },
  pixelate: { backend: 'gpu', amounts: ['pixelate'], family: 'tone' },
  hueShift: { backend: 'gpu', amounts: ['hueShift'], family: 'tone' },
  vignette: { backend: 'gpu', amounts: ['vignette'], family: 'tone' },
  bloom: { backend: 'gpu', amounts: ['bloom'], family: 'light' },
  posterize: { backend: 'gpu', amounts: ['posterize'], family: 'tone' },
  indexedPalette: { backend: 'worker', amounts: ['indexedPalette'], family: 'tone' },
  gradientMap: { backend: 'worker', amounts: ['gradientMap'], family: 'tone' },
  channelMixer: { backend: 'worker', amounts: ['channelMixer'], family: 'tone' },
  filmBurn: { backend: 'gpu', amounts: ['filmBurn'], family: 'light' },
  duotone: { backend: 'gpu', amounts: ['duotone'], family: 'print' },
  halftone: { backend: 'gpu', amounts: ['halftone'], family: 'print' },
  risoShift: { backend: 'gpu', amounts: ['risoShift'], family: 'print' },
  blur: { backend: 'gpu', amounts: ['blurAmt'], family: 'print' },
  threshold: { backend: 'gpu', amounts: ['threshold'], family: 'print' },
  edgeCrush: { backend: 'worker', amounts: ['edgeCrush'], family: 'print' },
  silhouetteCrush: { backend: 'worker', amounts: ['silhouetteCrush'], family: 'print' },
  bokehBlur: { backend: 'worker', amounts: ['bokehBlur'], family: 'print' },
  hatching: { backend: 'worker', amounts: ['hatching'], family: 'print' },
  gooeyMerge: { backend: 'worker', amounts: ['gooeyMerge'], family: 'print' },
  edgeDetect: { backend: 'gpu', amounts: ['edgeDetect'], family: 'print' },
  gradientOverlay: { backend: 'gpu', amounts: ['gradMix'], family: 'print' },
  neonGlow: { backend: 'canvas', amounts: ['neonGlow'], family: 'light' },
  zoomBlur: { backend: 'canvas', amounts: ['zoomBlur'], family: 'warp' },
  vhsTracking: { backend: 'worker', amounts: ['vhsTracking'], family: 'signal' },
  wave: { backend: 'worker', amounts: ['waveAmt'], family: 'warp' },
  matte: { backend: 'canvas', amounts: ['matte'], family: 'texture' },
  overprint: { backend: 'canvas', amounts: ['overprint'], family: 'print' },
  solarize: { backend: 'worker', amounts: ['solarize'], family: 'tone' },
  bleachBypass: { backend: 'worker', amounts: ['bleachBypass'], family: 'tone' },
  cyanotype: { backend: 'worker', amounts: ['cyanotype'], family: 'tone' },
  splitTone: { backend: 'worker', amounts: ['splitToneAmt'], family: 'tone' },
  ripple: { backend: 'worker', amounts: ['rippleAmt'], family: 'warp' },
  patternRefraction: { backend: 'worker', amounts: ['patternRefraction'], family: 'warp' },
  kaleidoscope: { backend: 'worker', amounts: ['kaleidoscope'], family: 'warp' },
  squeeze: { backend: 'worker', amounts: ['squeezeX', 'squeezeY'], activation: 'nonzero', family: 'warp' },
  emboss: { backend: 'canvas', amounts: ['emboss'], family: 'texture' },
  linocut: { backend: 'canvas', amounts: ['linocut'], family: 'texture' },
  fog: { backend: 'worker', amounts: ['fog'], family: 'light' },
  speedLines: { backend: 'canvas', amounts: ['speedLines'], family: 'light' },
} as const satisfies Record<string, EffectDefinition>;

export type EffectId = keyof typeof EFFECTS;

interface EffectParamBase {
  effect: EffectId;
  /** Inspector label. */
  label: string;
}

export interface EffectNumberParam extends EffectParamBase {
  type: 'number';
  default: number;
  min: number;
  max: number;
  /** Numeric entry accepts values up to this, past the slider's `max`. */
  overrideMax?: number;
  format?: EffectSliderValueFormat;
  /** `EFFECT_META` key of the slider's help, when it is not the parameter key. */
  help?: string;
}

export interface EffectColorParam extends EffectParamBase {
  type: 'color';
  default: string;
}

/** A parameter that picks one of a few named variants of its effect. */
export interface EffectChoiceParam extends EffectParamBase {
  type: 'choice';
  default: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type EffectParam = EffectNumberParam | EffectColorParam | EffectChoiceParam;

type NumberParamOptions = Pick<EffectNumberParam, 'overrideMax' | 'format' | 'help'>;

function num(
  effect: EffectId,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  options: NumberParamOptions = {},
): EffectNumberParam {
  return { type: 'number', effect, label, default: defaultValue, min, max, ...options };
}

function color(effect: EffectId, label: string, defaultValue: string): EffectColorParam {
  return { type: 'color', effect, label, default: defaultValue };
}

function choice(
  effect: EffectId,
  label: string,
  options: EffectChoiceParam['options'],
  defaultValue: string = options[0].value,
): EffectChoiceParam {
  return { type: 'choice', effect, label, options, default: defaultValue };
}

/** Every effect parameter, in stored field order. A parameter belongs to exactly one effect and one inspector section. */
export const EFFECT_PARAMS = {
  grain: num('grain', 'Grain', 0, 0, 50, { overrideMax: 100, format: 'percent' }),
  dotGrain: num('dotGrain', 'Dot Grain', 0, 0, 100, { format: 'percent' }),
  dotGrainSize: num('dotGrain', 'Dot Size', 4, 1, 9, { overrideMax: 18, format: 'px' }),
  dotGrainDensity: num('dotGrain', 'Density', 62, 0, 100, { format: 'percent' }),
  dotGrainJitter: num('dotGrain', 'Jitter', 35, 0, 100, { format: 'percent' }),
  scanlines: num('scanlines', 'Scanlines', 0, 0, 100, { format: 'percent' }),
  scanlineWidth: num('scanlines', 'Line Width', 1, 1, 12, { format: 'px' }),
  rgbSplit: num('rgbSplit', 'RGB Split', 0, 0, 30, { format: 'px' }),
  glitch: num('glitch', 'VHS Streaks', 0, 0, 24),
  badStream: num('badStream', 'Compression', 0, 0, 100, { format: 'percent' }),
  badStreamBlockSize: num('badStream', 'Macroblocks', 48, 12, 96, { overrideMax: 180, format: 'px' }),
  badStreamDetail: num('badStream', 'Detail Blocks', 42, 0, 100, { format: 'percent' }),
  badStreamSmear: num('badStream', 'Smear', 35, 0, 100, { format: 'percent' }),
  badStreamChroma: num('badStream', 'Chroma Drift', 28, 0, 100, { format: 'percent' }),
  badStreamDarkness: num('badStream', 'Darkness', 38, 0, 100, { format: 'percent' }),
  badStreamStages: choice('badStream', 'Stages', [
    { value: 'all', label: 'All stages' },
    { value: 'macroblocks', label: 'Macroblocks' },
    { value: 'detailBlocks', label: 'Detail blocks' },
    { value: 'blockSmear', label: 'Block smear' },
    { value: 'chromaBlocks', label: 'Chroma blocks' },
    { value: 'blockDropout', label: 'Block dropout' },
  ]),
  pixelStretch: num('pixelStretch', 'Stretch', 0, 0, 100, { format: 'percent' }),
  pixelStretchLength: num('pixelStretch', 'Length', 24, 1, 80, { overrideMax: 160, format: 'px' }),
  pixelStretchAngle: num('pixelStretch', 'Angle', 0, 0, 180, { format: 'deg' }),
  tint: color('tint', 'Tint Color', '#350055'),
  tintOp: num('tint', 'Opacity', 0, 0, 80, { format: 'percent' }),
  rays: num('rays', 'Count', 0, 0, 96, { overrideMax: 240 }),
  rayInt: num('rays', 'Intensity', 0, 0, 100, { format: 'percent' }),
  rayColor: color('rays', 'Ray Color', '#bb00ff'),
  morphAmt: num('morph', 'Liquid Morph', 0, 0, 100, { format: 'percent' }),
  morphFreq: num('morph', 'Morph Freq', 5, 1, 20),
  tearAmt: num('tear', 'Chunk Tear', 0, 0, 20),
  tearSize: num('tear', 'Tear Size', 3, 1, 20, { format: 'px' }),
  noiseWarp: num('noiseWarp', 'Noise Warp', 0, 0, 100, { format: 'percent' }),
  vortex: num('vortex', 'Vortex', 0, 0, 100, { format: 'percent' }),
  barrel: num('barrel', 'Barrel', 0, 0, 100, { format: 'percent' }),
  mirror: num('mirror', 'Mirror', 0, 0, 3),
  dataMosh: num('dataMosh', 'Data Mosh', 0, 0, 100, { format: 'percent' }),
  interlace: num('interlace', 'Interlace', 0, 0, 100, { format: 'percent' }),
  retroResolution: num('retroResolution', 'Longest Edge', 0, 8, 512, {
    overrideMax: 1024,
    format: 'px',
  }),
  pixelate: num('pixelate', 'Block Size', 0, 0, 20, { overrideMax: 80, format: 'px' }),
  hueShift: num('hueShift', 'Hue Shift', 0, 0, 360, { format: 'deg' }),
  vignette: num('vignette', 'Vignette', 0, 0, 100, { format: 'percent' }),
  bloom: num('bloom', 'Bloom', 0, 0, 100, { format: 'percent' }),
  posterize: num('posterize', 'Posterize', 0, 0, 16, { format: 'bands' }),
  indexedPalette: num('indexedPalette', 'Palette Mix', 0, 0, 100, { format: 'percent' }),
  indexedPaletteCount: num('indexedPalette', 'Color Count', 6, 2, 6, { format: 'steps' }),
  indexedColorA: color('indexedPalette', 'Color 1', '#12002b'),
  indexedColorB: color('indexedPalette', 'Color 2', '#3b1590'),
  indexedColorC: color('indexedPalette', 'Color 3', '#d400b8'),
  indexedColorD: color('indexedPalette', 'Color 4', '#ff1d1d'),
  indexedColorE: color('indexedPalette', 'Color 5', '#f6c400'),
  indexedColorF: color('indexedPalette', 'Color 6', '#fff1df'),
  gradientMap: num('gradientMap', 'Map Mix', 0, 0, 100, { format: 'percent' }),
  gradientMapShadow: color('gradientMap', 'Shadow', '#0d0033'),
  gradientMapMid: color('gradientMap', 'Midtone', '#9c5a13'),
  gradientMapHighlight: color('gradientMap', 'Highlight', '#00e6cc'),
  channelMixer: num('channelMixer', 'Mixer', 0, 0, 100, { format: 'percent' }),
  channelRedMix: num('channelMixer', 'Red Mix', 45, -100, 100, { format: 'percent' }),
  channelGreenMix: num('channelMixer', 'Green Mix', 35, -100, 100, { format: 'percent' }),
  channelBlueMix: num('channelMixer', 'Blue Mix', 25, -100, 100, { format: 'percent' }),
  filmBurn: num('filmBurn', 'Film Burn', 0, 0, 100, { format: 'percent' }),
  duotone: num('duotone', 'Duotone', 0, 0, 100, { format: 'percent' }),
  duoA: color('duotone', 'Shadow Color', '#0a0020'),
  duoB: color('duotone', 'Light Color', '#ff6ec7'),
  halftone: num('halftone', 'Halftone', 0, 0, 30, { format: 'px' }),
  risoShift: num('risoShift', 'Misreg Shift', 0, 0, 24, { overrideMax: 60, format: 'px' }),
  risoAngle: num('risoShift', 'Misreg Angle', 15, 0, 360, { format: 'deg' }),
  blurAmt: num('blur', 'Blur', 0, 0, 100, { format: 'px', help: 'blur' }),
  threshold: num('threshold', 'Cutoff', 0, 0, 100, { format: 'percent' }),
  edgeCrush: num('edgeCrush', 'Alpha Crush', 0, 0, 100, { format: 'percent' }),
  silhouetteCrush: num('silhouetteCrush', 'Silhouette Crush', 0, 0, 100, { format: 'percent' }),
  edgeDetect: num('edgeDetect', 'Linework', 0, 0, 100, { format: 'percent' }),
  bokehBlur: num('bokehBlur', 'Bokeh Blur', 0, 0, 28, { overrideMax: 60, format: 'px' }),
  bokehThreshold: num('bokehBlur', 'Highlight Gate', 68, 0, 100, { format: 'percent' }),
  hatching: num('hatching', 'Hatching', 0, 0, 100, { format: 'percent' }),
  hatchScale: num('hatching', 'Line Step', 9, 3, 28, { overrideMax: 48, format: 'px' }),
  hatchAngle: num('hatching', 'Angle', 35, 0, 180, { format: 'deg' }),
  gooeyMerge: num('gooeyMerge', 'Merge', 0, 0, 100, { format: 'percent' }),
  gooeyRadius: num('gooeyMerge', 'Radius', 8, 1, 40, { overrideMax: 80, format: 'px' }),
  gooeyThreshold: num('gooeyMerge', 'Threshold', 46, 0, 100, { format: 'percent' }),
  gradMix: num('gradientOverlay', 'Overlay Mix', 0, 0, 100, {
    format: 'percent',
    help: 'gradientOverlay',
  }),
  gradA: color('gradientOverlay', 'Start Color', '#0a0020'),
  gradB: color('gradientOverlay', 'End Color', '#ff6ec7'),
  gradAngle: num('gradientOverlay', 'Direction', 0, 0, 360, { format: 'deg' }),
  sepia: num('sepia', 'Sepia', 0, 0, 100, { format: 'percent' }),
  neonGlow: num('neonGlow', 'Neon Glow', 0, 0, 100, { format: 'percent' }),
  neonColor: color('neonGlow', 'Glow Color', '#ff00ff'),
  zoomBlur: num('zoomBlur', 'Zoom Blur', 0, 0, 100, { format: 'percent' }),
  vhsTracking: num('vhsTracking', 'VHS Tracking', 0, 0, 100, { format: 'percent' }),
  dither: num('dither', 'Dither', 0, 0, 70, { overrideMax: 100, format: 'percent' }),
  infrared: num('infrared', 'Infrared', 0, 0, 100, { format: 'percent' }),
  ca: num('ca', 'Radial CA', 0, 0, 40, { format: 'px' }),
  waveAmt: num('wave', 'Wave', 0, 0, 80, { format: 'px' }),
  waveFreq: num('wave', 'Wave Freq', 3, 1, 24),
  matte: num('matte', 'Matte', 0, 0, 100, { format: 'percent' }),
  overprint: num('overprint', 'Overprint', 0, 0, 100, { format: 'percent' }),
  solarize: num('solarize', 'Solarize', 0, 0, 100, { format: 'percent' }),
  bleachBypass: num('bleachBypass', 'Bleach', 0, 0, 100, { format: 'percent' }),
  cyanotype: num('cyanotype', 'Cyanotype', 0, 0, 100, { format: 'percent' }),
  splitToneAmt: num('splitTone', 'Split Tone', 0, 0, 100, { format: 'percent' }),
  splitShadow: color('splitTone', 'Shadow', '#001a4f'),
  splitHighlight: color('splitTone', 'Highlight', '#ff8040'),
  rippleAmt: num('ripple', 'Ripple', 0, 0, 100, { format: 'percent' }),
  rippleFreq: num('ripple', 'Ripple Freq', 3, 1, 24),
  patternRefraction: num('patternRefraction', 'Refraction', 0, 0, 100, { format: 'percent' }),
  patternRefractionScale: num('patternRefraction', 'Pattern Scale', 16, 4, 80, {
    overrideMax: 160,
    format: 'px',
  }),
  patternRefractionAngle: num('patternRefraction', 'Angle', 35, 0, 180, { format: 'deg' }),
  kaleidoscope: num('kaleidoscope', 'Kaleidoscope', 0, 0, 100, { format: 'percent' }),
  squeezeX: num('squeeze', 'Squeeze X', 0, -80, 80, { format: 'percent' }),
  squeezeY: num('squeeze', 'Squeeze Y', 0, -80, 80, { format: 'percent' }),
  emboss: num('emboss', 'Emboss', 0, 0, 100, { format: 'percent' }),
  linocut: num('linocut', 'Linocut', 0, 0, 100, { format: 'percent' }),
  fog: num('fog', 'Haze', 0, 0, 100, { format: 'percent' }),
  fogColor: color('fog', 'Haze Color', '#c8d8e8'),
  speedLines: num('speedLines', 'Speed Lines', 0, 0, 140, { overrideMax: 300 }),
} satisfies Record<string, EffectParam>;

export type EffectParamKey = keyof typeof EFFECT_PARAMS;

/** Stored values of every effect parameter: colors and choices are strings, everything else a number. */
export type EffectParamValues = {
  [K in EffectParamKey]: (typeof EFFECT_PARAMS)[K]['type'] extends 'color' | 'choice' ? string : number;
};

export interface EffectPresetVariant {
  /** The effect the preset adds, when the preset is not named after it. */
  effect?: EffectId;
  /** The effect parameters the preset shows; defaults to all of them. */
  shows?: readonly EffectParamKey[];
}

/** Presets that are not a plain "one preset per effect" mapping. */
export const EFFECT_PRESET_VARIANTS: Partial<Record<EffectPreset, EffectPresetVariant>> = {
  macroblocks: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDarkness'],
  },
  detailBlocks: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDetail', 'badStreamDarkness'],
  },
  blockSmear: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamSmear'],
  },
  chromaBlocks: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDetail', 'badStreamChroma'],
  },
  blockDropout: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDarkness'],
  },
};

const EFFECT_DEFINITIONS: Record<EffectId, EffectDefinition> = EFFECTS;
const EFFECT_PARAM_SPECS: Record<EffectParamKey, EffectParam> = EFFECT_PARAMS;

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];
export const EFFECT_PARAM_KEYS = Object.keys(EFFECT_PARAMS) as EffectParamKey[];

/** Default value of every effect parameter, in stored field order. */
export const EFFECT_PARAM_DEFAULTS = Object.fromEntries(
  EFFECT_PARAM_KEYS.map((key) => [key, EFFECT_PARAM_SPECS[key].default]),
) as EffectParamValues;

export function isEffectId(value: string): value is EffectId {
  return value in EFFECTS;
}

export function effectDefinition(effect: EffectId): EffectDefinition {
  return EFFECT_DEFINITIONS[effect];
}

export function effectParam(key: EffectParamKey): EffectParam {
  return EFFECT_PARAM_SPECS[key];
}

/** The parameters an effect owns, in stored field order. */
export function effectParamKeys(effect: EffectId): EffectParamKey[] {
  return EFFECT_PARAM_KEYS.filter((key) => EFFECT_PARAM_SPECS[key].effect === effect);
}

/** The effect a focused preset adds. */
export function effectOfPreset(preset: EffectPreset): EffectId {
  const effect = EFFECT_PRESET_VARIANTS[preset]?.effect ?? preset;
  if (!isEffectId(effect)) throw new Error(`Effect preset ${preset} has no effect`);
  return effect;
}

/** The effect parameters a focused preset shows in the inspector. */
export function presetParamKeys(preset: EffectPreset): EffectParamKey[] {
  const shows = EFFECT_PRESET_VARIANTS[preset]?.shows;
  return shows ? [...shows] : effectParamKeys(effectOfPreset(preset));
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Whether an effect runs for these parameter values. */
export function isEffectActive(values: Partial<Record<EffectParamKey, unknown>>, effect: EffectId): boolean {
  const { amounts, activation = 'positive' } = EFFECT_DEFINITIONS[effect];
  const amountValues = amounts.map((key) => numericValue(values[key as EffectParamKey]));
  switch (activation) {
    case 'allPositive':
      return amountValues.every((value) => value > 0);
    case 'nonzero':
      return amountValues.some((value) => value !== 0);
    default:
      return amountValues.some((value) => value > 0);
  }
}

/**
 * The order the renderer runs effects in when a layer's stack lists them in this order: the Canvas 2D / worker
 * chain, then the GPU filter chain. A stack is rendered in runs that follow this order (see `utils/effectStack.ts`).
 */
export const EFFECT_PASS_ORDER: readonly EffectId[] = [
  'retroResolution',
  'rays',
  'glitch',
  'badStream',
  'rgbSplit',
  'scanlines',
  'grain',
  'dotGrain',
  'tint',
  'sepia',
  'infrared',
  'ca',
  'dither',
  'indexedPalette',
  'gradientMap',
  'channelMixer',
  'edgeCrush',
  'silhouetteCrush',
  'pixelStretch',
  'bokehBlur',
  'hatching',
  'vhsTracking',
  'matte',
  'wave',
  'zoomBlur',
  'neonGlow',
  'overprint',
  'solarize',
  'bleachBypass',
  'cyanotype',
  'splitTone',
  'ripple',
  'patternRefraction',
  'kaleidoscope',
  'squeeze',
  'emboss',
  'linocut',
  'fog',
  'gooeyMerge',
  'speedLines',
  'mirror',
  'dataMosh',
  'interlace',
  'noiseWarp',
  'morph',
  'vortex',
  'barrel',
  'tear',
  'pixelate',
  'posterize',
  'hueShift',
  'duotone',
  'halftone',
  'risoShift',
  'bloom',
  'blur',
  'threshold',
  'edgeDetect',
  'gradientOverlay',
  'vignette',
  'filmBurn',
];

/** Whether an effect runs in the GPU filter pass rather than the Canvas 2D / worker pass. */
export function isGpuEffect(effect: EffectId): boolean {
  return EFFECT_DEFINITIONS[effect].backend === 'gpu';
}

/** Defaults of the parameters an effect owns. */
export function effectParamDefaults(effect: EffectId): Partial<EffectParamValues> {
  return Object.fromEntries(effectParamKeys(effect).map((key) => [key, EFFECT_PARAM_SPECS[key].default]));
}

/** Effects with this backend, in split order. */
export function effectsWithBackend(backend: EffectBackend): EffectId[] {
  return EFFECT_IDS.filter((effect) => EFFECT_DEFINITIONS[effect].backend === backend);
}
