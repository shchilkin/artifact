/**
 * The effect parameter schema: every `EffectLayer` parameter, the render effect that owns it, and how the editor
 * shows and randomizes it. Defaults, zero values, backend activation lists, inspector controls, preset splitting,
 * effect docs ranges, and randomization ranges are derived from these tables. Pixels come from the effect's render
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

/** A random value: a whole number in `[min, max]`, one of `pick`, or `range` with probability `chance` (else 0). */
export type EffectNumberRandom =
  | readonly [number, number]
  | { readonly pick: readonly number[] }
  | { readonly chance: number; readonly range: readonly [number, number] };

/** A random color around the randomizer's base hue, its accent hue, or any hue. */
export interface EffectColorRandom {
  hue: 'base' | 'accent' | 'any';
  hueOffset?: number;
  saturation: readonly [number, number];
  lightness: readonly [number, number];
}

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
  /** Range the effect's preset randomizer draws from. */
  random?: EffectNumberRandom;
}

export interface EffectColorParam extends EffectParamBase {
  type: 'color';
  default: string;
  random?: EffectColorRandom;
}

export type EffectParam = EffectNumberParam | EffectColorParam;

type NumberParamOptions = Pick<EffectNumberParam, 'overrideMax' | 'format' | 'help' | 'random'>;

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

function color(
  effect: EffectId,
  label: string,
  defaultValue: string,
  options: Pick<EffectColorParam, 'random'> = {},
): EffectColorParam {
  return { type: 'color', effect, label, default: defaultValue, ...options };
}

/** Every effect parameter, in stored field order. A parameter belongs to exactly one effect and one inspector section. */
export const EFFECT_PARAMS = {
  grain: num('grain', 'Grain', 0, 0, 50, { overrideMax: 100, format: 'percent', random: [8, 42] }),
  dotGrain: num('dotGrain', 'Dot Grain', 0, 0, 100, { format: 'percent', random: [45, 90] }),
  dotGrainSize: num('dotGrain', 'Dot Size', 4, 1, 9, { overrideMax: 18, format: 'px', random: [2, 7] }),
  dotGrainDensity: num('dotGrain', 'Density', 62, 0, 100, { format: 'percent', random: [40, 85] }),
  dotGrainJitter: num('dotGrain', 'Jitter', 35, 0, 100, { format: 'percent', random: [20, 75] }),
  scanlines: num('scanlines', 'Scanlines', 0, 0, 100, { format: 'percent', random: [5, 80] }),
  scanlineWidth: num('scanlines', 'Line Width', 1, 1, 12, { format: 'px', random: [1, 4] }),
  rgbSplit: num('rgbSplit', 'RGB Split', 0, 0, 30, { format: 'px', random: [0, 12] }),
  glitch: num('glitch', 'VHS Streaks', 0, 0, 24, { random: [0, 18] }),
  badStream: num('badStream', 'Compression', 0, 0, 100, { format: 'percent', random: [35, 88] }),
  badStreamBlockSize: num('badStream', 'Macroblocks', 48, 12, 96, { overrideMax: 180, format: 'px', random: [28, 86] }),
  badStreamDetail: num('badStream', 'Detail Blocks', 42, 0, 100, { format: 'percent', random: [18, 72] }),
  badStreamSmear: num('badStream', 'Smear', 35, 0, 100, { format: 'percent', random: [10, 68] }),
  badStreamChroma: num('badStream', 'Chroma Drift', 28, 0, 100, { format: 'percent', random: [8, 56] }),
  badStreamDarkness: num('badStream', 'Darkness', 38, 0, 100, { format: 'percent', random: [18, 72] }),
  pixelStretch: num('pixelStretch', 'Stretch', 0, 0, 100, { format: 'percent', random: [35, 90] }),
  pixelStretchLength: num('pixelStretch', 'Length', 24, 1, 80, { overrideMax: 160, format: 'px', random: [12, 64] }),
  pixelStretchAngle: num('pixelStretch', 'Angle', 0, 0, 180, { format: 'deg', random: [0, 180] }),
  tint: color('tint', 'Tint Color', '#350055', { random: { hue: 'any', saturation: [40, 80], lightness: [10, 28] } }),
  tintOp: num('tint', 'Opacity', 0, 0, 80, { format: 'percent', random: [15, 65] }),
  rays: num('rays', 'Count', 0, 0, 96, { overrideMax: 240, random: [4, 48] }),
  rayInt: num('rays', 'Intensity', 0, 0, 100, { format: 'percent', random: [20, 90] }),
  rayColor: color('rays', 'Ray Color', '#bb00ff', {
    random: { hue: 'accent', saturation: [70, 100], lightness: [55, 80] },
  }),
  morphAmt: num('morph', 'Liquid Morph', 0, 0, 100, { format: 'percent', random: [10, 80] }),
  morphFreq: num('morph', 'Morph Freq', 5, 1, 20, { random: [1, 15] }),
  tearAmt: num('tear', 'Chunk Tear', 0, 0, 20, { random: [1, 15] }),
  tearSize: num('tear', 'Tear Size', 3, 1, 20, { format: 'px', random: [1, 12] }),
  noiseWarp: num('noiseWarp', 'Noise Warp', 0, 0, 100, { format: 'percent', random: [10, 70] }),
  vortex: num('vortex', 'Vortex', 0, 0, 100, { format: 'percent', random: [5, 60] }),
  barrel: num('barrel', 'Barrel', 0, 0, 100, { format: 'percent', random: [5, 70] }),
  mirror: num('mirror', 'Mirror', 0, 0, 3, { random: [1, 3] }),
  dataMosh: num('dataMosh', 'Data Mosh', 0, 0, 100, { format: 'percent', random: [10, 70] }),
  interlace: num('interlace', 'Interlace', 0, 0, 100, { format: 'percent', random: [10, 70] }),
  retroResolution: num('retroResolution', 'Longest Edge', 0, 8, 512, {
    overrideMax: 1024,
    format: 'px',
    random: { pick: [160, 240, 320, 512] },
  }),
  pixelate: num('pixelate', 'Block Size', 0, 0, 20, { overrideMax: 80, format: 'px', random: [2, 10] }),
  hueShift: num('hueShift', 'Hue Shift', 0, 0, 360, { format: 'deg', random: [10, 350] }),
  vignette: num('vignette', 'Vignette', 0, 0, 100, { format: 'percent', random: [0, 80] }),
  bloom: num('bloom', 'Bloom', 0, 0, 100, { format: 'percent', random: [15, 80] }),
  posterize: num('posterize', 'Posterize', 0, 0, 16, { format: 'bands', random: [3, 12] }),
  indexedPalette: num('indexedPalette', 'Palette Mix', 0, 0, 100, { format: 'percent', random: [65, 100] }),
  indexedPaletteCount: num('indexedPalette', 'Color Count', 6, 2, 6, { format: 'steps', random: [3, 6] }),
  indexedColorA: color('indexedPalette', 'Color 1', '#12002b'),
  indexedColorB: color('indexedPalette', 'Color 2', '#3b1590'),
  indexedColorC: color('indexedPalette', 'Color 3', '#d400b8'),
  indexedColorD: color('indexedPalette', 'Color 4', '#ff1d1d'),
  indexedColorE: color('indexedPalette', 'Color 5', '#f6c400'),
  indexedColorF: color('indexedPalette', 'Color 6', '#fff1df'),
  gradientMap: num('gradientMap', 'Map Mix', 0, 0, 100, { format: 'percent', random: [45, 95] }),
  gradientMapShadow: color('gradientMap', 'Shadow', '#0d0033', {
    random: { hue: 'base', saturation: [40, 80], lightness: [3, 14] },
  }),
  gradientMapMid: color('gradientMap', 'Midtone', '#9c5a13', {
    random: { hue: 'base', hueOffset: 70, saturation: [40, 90], lightness: [28, 48] },
  }),
  gradientMapHighlight: color('gradientMap', 'Highlight', '#00e6cc', {
    random: { hue: 'accent', saturation: [60, 100], lightness: [58, 86] },
  }),
  channelMixer: num('channelMixer', 'Mixer', 0, 0, 100, { format: 'percent', random: [35, 90] }),
  channelRedMix: num('channelMixer', 'Red Mix', 45, -100, 100, { format: 'percent', random: [-20, 80] }),
  channelGreenMix: num('channelMixer', 'Green Mix', 35, -100, 100, { format: 'percent', random: [-20, 80] }),
  channelBlueMix: num('channelMixer', 'Blue Mix', 25, -100, 100, { format: 'percent', random: [-20, 80] }),
  filmBurn: num('filmBurn', 'Film Burn', 0, 0, 100, { format: 'percent', random: [20, 90] }),
  duotone: num('duotone', 'Duotone', 0, 0, 100, { format: 'percent', random: [40, 90] }),
  duoA: color('duotone', 'Shadow Color', '#0a0020', {
    random: { hue: 'base', saturation: [30, 60], lightness: [3, 12] },
  }),
  duoB: color('duotone', 'Light Color', '#ff6ec7', {
    random: { hue: 'accent', saturation: [60, 100], lightness: [55, 85] },
  }),
  halftone: num('halftone', 'Halftone', 0, 0, 30, { format: 'px', random: [5, 20] }),
  risoShift: num('risoShift', 'Misreg Shift', 0, 0, 24, { overrideMax: 60, format: 'px', random: [4, 18] }),
  risoAngle: num('risoShift', 'Misreg Angle', 15, 0, 360, { format: 'deg', random: [0, 360] }),
  blurAmt: num('blur', 'Blur', 0, 0, 100, { format: 'px', help: 'blur', random: [10, 70] }),
  threshold: num('threshold', 'Cutoff', 0, 0, 100, { format: 'percent', random: [30, 70] }),
  edgeCrush: num('edgeCrush', 'Alpha Crush', 0, 0, 100, { format: 'percent', random: [35, 85] }),
  silhouetteCrush: num('silhouetteCrush', 'Silhouette Crush', 0, 0, 100, { format: 'percent', random: [35, 85] }),
  edgeDetect: num('edgeDetect', 'Linework', 0, 0, 100, { format: 'percent', random: [40, 90] }),
  bokehBlur: num('bokehBlur', 'Bokeh Blur', 0, 0, 28, { overrideMax: 60, format: 'px', random: [6, 20] }),
  bokehThreshold: num('bokehBlur', 'Highlight Gate', 68, 0, 100, { format: 'percent', random: [55, 85] }),
  hatching: num('hatching', 'Hatching', 0, 0, 100, { format: 'percent', random: [35, 90] }),
  hatchScale: num('hatching', 'Line Step', 9, 3, 28, { overrideMax: 48, format: 'px', random: [5, 16] }),
  hatchAngle: num('hatching', 'Angle', 35, 0, 180, { format: 'deg', random: [0, 180] }),
  gooeyMerge: num('gooeyMerge', 'Merge', 0, 0, 100, { format: 'percent', random: [35, 90] }),
  gooeyRadius: num('gooeyMerge', 'Radius', 8, 1, 40, { overrideMax: 80, format: 'px', random: [5, 18] }),
  gooeyThreshold: num('gooeyMerge', 'Threshold', 46, 0, 100, { format: 'percent', random: [35, 65] }),
  gradMix: num('gradientOverlay', 'Overlay Mix', 0, 0, 100, {
    format: 'percent',
    help: 'gradientOverlay',
    random: [30, 80],
  }),
  gradA: color('gradientOverlay', 'Start Color', '#0a0020', {
    random: { hue: 'base', saturation: [40, 80], lightness: [10, 30] },
  }),
  gradB: color('gradientOverlay', 'End Color', '#ff6ec7', {
    random: { hue: 'accent', saturation: [60, 100], lightness: [55, 85] },
  }),
  gradAngle: num('gradientOverlay', 'Direction', 0, 0, 360, { format: 'deg', random: [0, 360] }),
  sepia: num('sepia', 'Sepia', 0, 0, 100, { format: 'percent', random: [40, 90] }),
  neonGlow: num('neonGlow', 'Neon Glow', 0, 0, 100, { format: 'percent', random: [25, 80] }),
  neonColor: color('neonGlow', 'Glow Color', '#ff00ff', {
    random: { hue: 'accent', saturation: [80, 100], lightness: [50, 80] },
  }),
  zoomBlur: num('zoomBlur', 'Zoom Blur', 0, 0, 100, { format: 'percent', random: [15, 65] }),
  vhsTracking: num('vhsTracking', 'VHS Tracking', 0, 0, 100, { format: 'percent', random: [10, 60] }),
  dither: num('dither', 'Dither', 0, 0, 70, { overrideMax: 100, format: 'percent', random: [18, 54] }),
  infrared: num('infrared', 'Infrared', 0, 0, 100, { format: 'percent', random: [40, 90] }),
  ca: num('ca', 'Radial CA', 0, 0, 40, { format: 'px', random: [5, 25] }),
  waveAmt: num('wave', 'Wave', 0, 0, 80, { format: 'px', random: [8, 45] }),
  waveFreq: num('wave', 'Wave Freq', 3, 1, 24, { random: [1, 8] }),
  matte: num('matte', 'Matte', 0, 0, 100, { format: 'percent', random: [15, 65] }),
  overprint: num('overprint', 'Overprint', 0, 0, 100, { format: 'percent', random: [10, 55] }),
  solarize: num('solarize', 'Solarize', 0, 0, 100, { format: 'percent', random: [30, 80] }),
  bleachBypass: num('bleachBypass', 'Bleach', 0, 0, 100, { format: 'percent', random: [20, 70] }),
  cyanotype: num('cyanotype', 'Cyanotype', 0, 0, 100, { format: 'percent', random: [20, 80] }),
  splitToneAmt: num('splitTone', 'Split Tone', 0, 0, 100, { format: 'percent', random: [20, 70] }),
  splitShadow: color('splitTone', 'Shadow', '#001a4f'),
  splitHighlight: color('splitTone', 'Highlight', '#ff8040'),
  rippleAmt: num('ripple', 'Ripple', 0, 0, 100, { format: 'percent', random: [10, 60] }),
  rippleFreq: num('ripple', 'Ripple Freq', 3, 1, 24, { random: [1, 8] }),
  patternRefraction: num('patternRefraction', 'Refraction', 0, 0, 100, { format: 'percent', random: [35, 85] }),
  patternRefractionScale: num('patternRefraction', 'Pattern Scale', 16, 4, 80, {
    overrideMax: 160,
    format: 'px',
    random: [8, 36],
  }),
  patternRefractionAngle: num('patternRefraction', 'Angle', 35, 0, 180, { format: 'deg', random: [0, 180] }),
  kaleidoscope: num('kaleidoscope', 'Kaleidoscope', 0, 0, 100, { format: 'percent', random: [20, 80] }),
  squeezeX: num('squeeze', 'Squeeze X', 0, -80, 80, { format: 'percent', random: { chance: 0.4, range: [-60, 60] } }),
  squeezeY: num('squeeze', 'Squeeze Y', 0, -80, 80, { format: 'percent', random: { chance: 0.4, range: [-60, 60] } }),
  emboss: num('emboss', 'Emboss', 0, 0, 100, { format: 'percent', random: [20, 80] }),
  linocut: num('linocut', 'Linocut', 0, 0, 100, { format: 'percent', random: [20, 80] }),
  fog: num('fog', 'Haze', 0, 0, 100, { format: 'percent', random: [20, 70] }),
  fogColor: color('fog', 'Haze Color', '#c8d8e8'),
  speedLines: num('speedLines', 'Speed Lines', 0, 0, 140, { overrideMax: 300, random: [10, 80] }),
} satisfies Record<string, EffectParam>;

export type EffectParamKey = keyof typeof EFFECT_PARAMS;

/** Stored values of every effect parameter: colors are hex strings, everything else a number. */
export type EffectParamValues = {
  [K in EffectParamKey]: (typeof EFFECT_PARAMS)[K]['type'] extends 'color' ? string : number;
};

export type EffectControlSectionId = 'rays' | 'glitch' | 'texture' | 'tint' | 'warp' | 'color' | 'riso' | 'graphic';

/** Inspector sections and the order of their controls. Every parameter appears in exactly one section. */
export const EFFECT_SECTIONS: ReadonlyArray<{
  id: EffectControlSectionId;
  title: string;
  params: readonly EffectParamKey[];
}> = [
  {
    id: 'rays',
    title: 'Light Rays',
    params: [
      'rayColor',
      'rayInt',
      'rays',
      'bloom',
      'filmBurn',
      'neonGlow',
      'neonColor',
      'fog',
      'fogColor',
      'speedLines',
    ],
  },
  {
    id: 'glitch',
    title: 'Glitch',
    params: [
      'glitch',
      'rgbSplit',
      'ca',
      'interlace',
      'dataMosh',
      'vhsTracking',
      'badStream',
      'badStreamBlockSize',
      'badStreamDetail',
      'badStreamSmear',
      'badStreamChroma',
      'badStreamDarkness',
      'pixelStretch',
      'pixelStretchLength',
      'pixelStretchAngle',
    ],
  },
  {
    id: 'texture',
    title: 'Texture',
    params: [
      'grain',
      'dotGrain',
      'dotGrainSize',
      'dotGrainDensity',
      'dotGrainJitter',
      'scanlines',
      'scanlineWidth',
      'matte',
      'dither',
      'emboss',
      'linocut',
    ],
  },
  {
    id: 'tint',
    title: 'Tint',
    params: ['tint', 'tintOp'],
  },
  {
    id: 'warp',
    title: 'Warp',
    params: [
      'noiseWarp',
      'morphAmt',
      'morphFreq',
      'vortex',
      'barrel',
      'tearAmt',
      'tearSize',
      'mirror',
      'waveAmt',
      'waveFreq',
      'zoomBlur',
      'rippleAmt',
      'rippleFreq',
      'patternRefraction',
      'patternRefractionScale',
      'patternRefractionAngle',
      'kaleidoscope',
      'squeezeX',
      'squeezeY',
    ],
  },
  {
    id: 'color',
    title: 'Color',
    params: [
      'hueShift',
      'vignette',
      'retroResolution',
      'pixelate',
      'posterize',
      'indexedPalette',
      'indexedPaletteCount',
      'indexedColorA',
      'indexedColorB',
      'indexedColorC',
      'indexedColorD',
      'indexedColorE',
      'indexedColorF',
      'gradientMap',
      'gradientMapShadow',
      'gradientMapMid',
      'gradientMapHighlight',
      'channelMixer',
      'channelRedMix',
      'channelGreenMix',
      'channelBlueMix',
      'sepia',
      'infrared',
      'solarize',
      'bleachBypass',
      'cyanotype',
      'splitToneAmt',
      'splitShadow',
      'splitHighlight',
    ],
  },
  {
    id: 'riso',
    title: 'Riso',
    params: ['duotone', 'duoA', 'duoB', 'halftone', 'risoShift', 'risoAngle', 'overprint'],
  },
  {
    id: 'graphic',
    title: 'Graphic',
    params: [
      'blurAmt',
      'threshold',
      'edgeCrush',
      'silhouetteCrush',
      'edgeDetect',
      'bokehBlur',
      'bokehThreshold',
      'hatching',
      'hatchScale',
      'hatchAngle',
      'gooeyMerge',
      'gooeyRadius',
      'gooeyThreshold',
      'gradMix',
      'gradA',
      'gradB',
      'gradAngle',
    ],
  },
];

export interface EffectPresetVariant {
  /** The effect the preset adds, when the preset is not named after it. */
  effect?: EffectId;
  /** The effect parameters the preset shows; defaults to all of them. */
  shows?: readonly EffectParamKey[];
  /** Randomizer ranges that replace or add to the shown parameters' own `random`. */
  random?: Partial<Record<EffectParamKey, EffectNumberRandom>>;
}

/** Presets that are not a plain "one preset per effect" mapping. */
export const EFFECT_PRESET_VARIANTS: Partial<Record<EffectPreset, EffectPresetVariant>> = {
  badStream: {
    random: {
      pixelStretch: { chance: 0.18, range: [25, 85] },
      pixelStretchLength: [10, 58],
      pixelStretchAngle: [0, 180],
    },
  },
  macroblocks: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDarkness'],
    random: { badStream: [38, 86], badStreamBlockSize: [32, 96], badStreamDarkness: [0, 36] },
  },
  detailBlocks: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDetail', 'badStreamDarkness'],
    random: {
      badStream: [45, 90],
      badStreamBlockSize: [28, 72],
      badStreamDetail: [45, 100],
      badStreamChroma: [0, 42],
      badStreamDarkness: [0, 38],
    },
  },
  blockSmear: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamSmear'],
    random: { badStream: [38, 86], badStreamBlockSize: [30, 90], badStreamSmear: [35, 100] },
  },
  chromaBlocks: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDetail', 'badStreamChroma'],
    random: { badStream: [36, 84], badStreamBlockSize: [24, 72], badStreamDetail: [0, 60], badStreamChroma: [45, 100] },
  },
  blockDropout: {
    effect: 'badStream',
    shows: ['badStream', 'badStreamBlockSize', 'badStreamDarkness'],
    random: { badStream: [40, 88], badStreamBlockSize: [32, 100], badStreamDarkness: [45, 100] },
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

/** Effects with this backend, in split order. */
export function effectsWithBackend(backend: EffectBackend): EffectId[] {
  return EFFECT_IDS.filter((effect) => EFFECT_DEFINITIONS[effect].backend === backend);
}
