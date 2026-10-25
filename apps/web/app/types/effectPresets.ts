/** Focused effect presets: the layer defaults, preset metadata, menu order, and preset layer factories. */
import type { EffectEntry, EffectLayer } from './config';
import {
  isKernelActive,
  KERNEL_PARAM_DEFAULTS,
  KERNEL_PARAMS,
  KERNEL_PASS_ORDER,
  type KernelId,
  type KernelParamKey,
  type KernelParamValues,
  kernelOfPreset,
} from './effectKernels';
import { type EffectId, type EffectParams, effectDefaults, effectFromKernel, effectSpec } from './effectSchema';
import { genId } from './layerIds';

export type EffectPreset =
  | 'shadow'
  | 'grimeShadow'
  | 'adjust'
  | 'sharpen'
  | 'rays'
  | 'bloom'
  | 'filmBurn'
  | 'glitch'
  | 'rgbSplit'
  | 'interlace'
  | 'dataMosh'
  | 'badStream'
  | 'macroblocks'
  | 'detailBlocks'
  | 'blockSmear'
  | 'chromaBlocks'
  | 'blockDropout'
  | 'pixelStretch'
  | 'grain'
  | 'dotGrain'
  | 'scanlines'
  | 'tint'
  | 'noiseWarp'
  | 'morph'
  | 'vortex'
  | 'barrel'
  | 'tear'
  | 'mirror'
  | 'hueShift'
  | 'vignette'
  | 'retroResolution'
  | 'pixelate'
  | 'posterize'
  | 'indexedPalette'
  | 'gradientMap'
  | 'channelMixer'
  | 'duotone'
  | 'halftone'
  | 'risoShift'
  | 'blur'
  | 'threshold'
  | 'edgeCrush'
  | 'silhouetteCrush'
  | 'edgeDetect'
  | 'bokehBlur'
  | 'hatching'
  | 'gooeyMerge'
  | 'gradientOverlay'
  | 'sepia'
  | 'neonGlow'
  | 'zoomBlur'
  | 'vhsTracking'
  | 'dither'
  | 'infrared'
  | 'ca'
  | 'wave'
  | 'matte'
  | 'overprint'
  | 'solarize'
  | 'bleachBypass'
  | 'cyanotype'
  | 'splitTone'
  | 'ripple'
  | 'patternRefraction'
  | 'kaleidoscope'
  | 'squeeze'
  | 'emboss'
  | 'linocut'
  | 'fog'
  | 'speedLines';

export const DEFAULT_EFFECT_LAYER_PROPS: Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked'> = {
  kind: 'effect',
  effects: [],
  mix: 100,
  appliesTo: 'all',
  maskAlpha: false,
  seedOffset: 0,
};

/** Layer fields plus flat kernel parameter values, for code that describes a look as one set of values. */
export type EffectLayerInit = Partial<EffectLayer> & Partial<KernelParamValues>;

function splitEffectLayerInit(init: EffectLayerInit): {
  fields: Partial<EffectLayer>;
  params: Partial<KernelParamValues>;
} {
  const fields: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(init)) {
    if (value === undefined) continue;
    if (key in KERNEL_PARAMS) params[key] = value;
    else fields[key] = value;
  }
  return { fields, params };
}

/** A stack entry for one effect: its own parameters from `params`, defaults for the rest. */
export function makeEffectEntry(effect: EffectId, params: EffectParams = {}, id: string = genId()): EffectEntry {
  const own = Object.fromEntries(
    Object.keys(effectSpec(effect).params)
      .filter((key) => params[key] !== undefined)
      .map((key) => [key, params[key]]),
  );
  return { id, effect, enabled: true, params: { ...effectDefaults(effect), ...own } };
}

/**
 * Stack entries for flat kernel values: one per active kernel in pass order (`include` is listed even when
 * inactive), each as the effect that absorbs the kernel. Entry ids are `<layerId>-<kernel>`.
 */
export function effectEntriesFromParams(
  layerId: string,
  values: Partial<KernelParamValues>,
  include?: KernelId,
): EffectEntry[] {
  const full = { ...KERNEL_PARAM_DEFAULTS, ...values };
  return KERNEL_PASS_ORDER.filter((kernel) => kernel === include || isKernelActive(full, kernel)).map((kernel) => {
    const { effect, params } = effectFromKernel(kernel, full);
    return { id: `${layerId}-${kernel}`, effect, enabled: true, params };
  });
}

/** A new effect layer. Flat parameter values in `init` become stack entries unless `init.effects` is given. */
export function makeEffectLayer(init: EffectLayerInit = {}): EffectLayer {
  const { fields, params } = splitEffectLayerInit(init);
  const id = fields.id ?? genId();
  return {
    name: 'Effect',
    visible: true,
    locked: false,
    ...DEFAULT_EFFECT_LAYER_PROPS,
    effects: effectEntriesFromParams(id, params),
    ...fields,
    id,
  };
}

export interface EffectPresetMeta {
  name: string;
  icon: string;
  /** Parameter values of the preset's effect. */
  partial: Partial<KernelParamValues>;
  primary: KernelParamKey | null;
}

export const EFFECT_PRESETS: Record<EffectPreset, EffectPresetMeta> = {
  rays: {
    name: 'Rays',
    icon: '✶',
    primary: 'rays',
    partial: { rays: 16, rayInt: 65, rayColor: '#bb00ff' },
  },
  bloom: {
    name: 'Bloom',
    icon: '✹',
    primary: 'bloom',
    partial: { bloom: 30 },
  },
  filmBurn: {
    name: 'Film Burn',
    icon: '☼',
    primary: 'filmBurn',
    partial: { filmBurn: 35 },
  },
  glitch: {
    name: 'Glitch',
    icon: '▒',
    primary: 'glitch',
    partial: { glitch: 14 },
  },
  interlace: {
    name: 'Interlace',
    icon: '≋',
    primary: 'interlace',
    partial: { interlace: 40 },
  },
  dataMosh: {
    name: 'Data Mosh',
    icon: '▥',
    primary: 'dataMosh',
    partial: { dataMosh: 30 },
  },
  badStream: {
    name: 'Bad Stream',
    icon: '▧',
    primary: 'badStream',
    partial: {
      badStream: 72,
      badStreamBlockSize: 54,
      badStreamDetail: 48,
      badStreamSmear: 38,
      badStreamChroma: 28,
      badStreamDarkness: 42,
    },
  },
  macroblocks: {
    name: 'Macroblocks',
    icon: '▦',
    primary: 'badStream',
    partial: {
      badStreamStages: 'macroblocks',
      badStream: 72,
      badStreamBlockSize: 64,
      badStreamDetail: 0,
      badStreamSmear: 0,
      badStreamChroma: 0,
      badStreamDarkness: 18,
    },
  },
  detailBlocks: {
    name: 'Detail Blocks',
    icon: '▥',
    primary: 'badStreamDetail',
    partial: {
      badStreamStages: 'detailBlocks',
      badStream: 82,
      badStreamBlockSize: 54,
      badStreamDetail: 86,
      badStreamSmear: 0,
      badStreamChroma: 28,
      badStreamDarkness: 22,
    },
  },
  blockSmear: {
    name: 'Block Smear',
    icon: '▰',
    primary: 'badStreamSmear',
    partial: {
      badStreamStages: 'blockSmear',
      badStream: 76,
      badStreamBlockSize: 52,
      badStreamDetail: 0,
      badStreamSmear: 82,
      badStreamChroma: 0,
      badStreamDarkness: 0,
    },
  },
  chromaBlocks: {
    name: 'Chroma Blocks',
    icon: '◫',
    primary: 'badStreamChroma',
    partial: {
      badStreamStages: 'chromaBlocks',
      badStream: 70,
      badStreamBlockSize: 46,
      badStreamDetail: 36,
      badStreamSmear: 0,
      badStreamChroma: 86,
      badStreamDarkness: 0,
    },
  },
  blockDropout: {
    name: 'Block Dropout',
    icon: '▨',
    primary: 'badStreamDarkness',
    partial: {
      badStreamStages: 'blockDropout',
      badStream: 78,
      badStreamBlockSize: 58,
      badStreamDetail: 0,
      badStreamSmear: 0,
      badStreamChroma: 0,
      badStreamDarkness: 86,
    },
  },
  pixelStretch: {
    name: 'Pixel Stretch',
    icon: '▥',
    primary: 'pixelStretch',
    partial: { pixelStretch: 70, pixelStretchLength: 34, pixelStretchAngle: 0 },
  },
  grain: {
    name: 'Grain',
    icon: '⣿',
    primary: 'grain',
    partial: { grain: 26 },
  },
  dotGrain: {
    name: 'Dot Grain',
    icon: '◌',
    primary: 'dotGrain',
    partial: { dotGrain: 68, dotGrainSize: 4, dotGrainDensity: 66, dotGrainJitter: 42 },
  },
  scanlines: {
    name: 'Scanlines',
    icon: '☰',
    primary: 'scanlines',
    partial: { scanlines: 18, scanlineWidth: 1 },
  },
  tint: {
    name: 'Tint',
    icon: '◈',
    primary: 'tintOp',
    partial: { tint: '#350055', tintOp: 45 },
  },
  noiseWarp: {
    name: 'Noise Warp',
    icon: '◌',
    primary: 'noiseWarp',
    partial: { noiseWarp: 40 },
  },
  morph: {
    name: 'Morph',
    icon: '∿',
    primary: null,
    partial: { morphAmt: 30, morphFreq: 5 },
  },
  vortex: {
    name: 'Vortex',
    icon: '◍',
    primary: 'vortex',
    partial: { vortex: 20 },
  },
  barrel: {
    name: 'Barrel',
    icon: '◔',
    primary: 'barrel',
    partial: { barrel: 25 },
  },
  tear: {
    name: 'Tear',
    icon: '╱',
    primary: 'tearAmt',
    partial: { tearAmt: 8, tearSize: 3 },
  },
  mirror: {
    name: 'Mirror',
    icon: '║',
    primary: null,
    partial: { mirror: 1 },
  },
  shadow: {
    name: 'Shadow',
    icon: '◖',
    primary: 'shadowOpacity',
    partial: {
      shadowOpacity: 60,
      shadowColor: '#000000',
      shadowX: 6,
      shadowY: 8,
      shadowBlur: 8,
      shadowSpread: 0,
      shadowLayers: 1,
      shadowGrime: 0,
      shadowJitter: 0,
      shadowFalloff: 'flat',
    },
  },
  grimeShadow: {
    name: 'Grime Shadow',
    icon: '◖',
    primary: 'shadowOpacity',
    partial: { shadowOpacity: 58 },
  },
  adjust: {
    name: 'Adjust',
    icon: '◑',
    primary: 'adjustContrast',
    partial: { adjustContrast: 20, adjustSaturation: 15 },
  },
  sharpen: {
    name: 'Sharpen',
    icon: '◇',
    primary: 'sharpen',
    partial: { sharpen: 40 },
  },
  hueShift: {
    name: 'Hue Shift',
    icon: '◐',
    primary: 'hueShift',
    partial: { hueShift: 60 },
  },
  rgbSplit: {
    name: 'RGB Split',
    icon: '◭',
    primary: 'rgbSplit',
    partial: { rgbSplit: 8 },
  },
  vignette: {
    name: 'Vignette',
    icon: '◜',
    primary: 'vignette',
    partial: { vignette: 40 },
  },
  retroResolution: {
    name: 'Retro Resolution',
    icon: '▣',
    primary: 'retroResolution',
    partial: { retroResolution: 320 },
  },
  pixelate: {
    name: 'Pixelate',
    icon: '▦',
    primary: 'pixelate',
    partial: { pixelate: 6 },
  },
  posterize: {
    name: 'Posterize',
    icon: '◨',
    primary: 'posterize',
    partial: { posterize: 6 },
  },
  indexedPalette: {
    name: 'Indexed Palette',
    icon: '▥',
    primary: 'indexedPalette',
    partial: {
      indexedPalette: 100,
      indexedPaletteCount: 6,
      indexedColorA: '#12002b',
      indexedColorB: '#3b1590',
      indexedColorC: '#d400b8',
      indexedColorD: '#ff1d1d',
      indexedColorE: '#f6c400',
      indexedColorF: '#fff1df',
    },
  },
  gradientMap: {
    name: 'Gradient Map',
    icon: '◫',
    primary: 'gradientMap',
    partial: {
      gradientMap: 80,
      gradientMapShadow: '#0d0033',
      gradientMapMid: '#865812',
      gradientMapHighlight: '#00e6cc',
    },
  },
  channelMixer: {
    name: 'Channel Mixer',
    icon: '◭',
    primary: 'channelMixer',
    partial: {
      channelMixer: 70,
      channelRedMix: 55,
      channelGreenMix: 35,
      channelBlueMix: 45,
    },
  },
  duotone: {
    name: 'Duotone',
    icon: '◎',
    primary: 'duotone',
    partial: { duotone: 60, duoA: '#0a0020', duoB: '#ff6ec7' },
  },
  halftone: {
    name: 'Halftone',
    icon: '◩',
    primary: 'halftone',
    partial: { halftone: 12 },
  },
  risoShift: {
    name: 'Misregister',
    icon: '⟲',
    primary: 'risoShift',
    partial: { risoShift: 14, risoAngle: 15 },
  },
  blur: {
    name: 'Blur',
    icon: '◯',
    primary: 'blurAmt',
    partial: { blurAmt: 30 },
  },
  threshold: {
    name: 'Threshold',
    icon: '◐',
    primary: 'threshold',
    partial: { threshold: 50 },
  },
  edgeCrush: {
    name: 'Alpha Crush',
    icon: '◈',
    primary: 'edgeCrush',
    partial: { edgeCrush: 55 },
  },
  silhouetteCrush: {
    name: 'Silhouette Crush',
    icon: '◆',
    primary: 'silhouetteCrush',
    partial: { silhouetteCrush: 55 },
  },
  edgeDetect: {
    name: 'Edge Detect',
    icon: '◇',
    primary: 'edgeDetect',
    partial: { edgeDetect: 60 },
  },
  bokehBlur: {
    name: 'Bokeh Blur',
    icon: '◎',
    primary: 'bokehBlur',
    partial: { bokehBlur: 12, bokehThreshold: 68 },
  },
  hatching: {
    name: 'Hatching',
    icon: '≋',
    primary: 'hatching',
    partial: { hatching: 65, hatchScale: 9, hatchAngle: 35 },
  },
  gooeyMerge: {
    name: 'Gooey Merge',
    icon: '●',
    primary: 'gooeyMerge',
    partial: { gooeyMerge: 72, gooeyRadius: 10, gooeyThreshold: 42 },
  },
  gradientOverlay: {
    name: 'Gradient',
    icon: '▤',
    primary: 'gradMix',
    partial: {
      gradMix: 50,
      gradA: '#0a0020',
      gradB: '#ff6ec7',
      gradAngle: 0,
    },
  },
  sepia: {
    name: 'Sepia',
    icon: '◬',
    primary: 'sepia',
    partial: { sepia: 65 },
  },
  neonGlow: {
    name: 'Neon Glow',
    icon: '✦',
    primary: 'neonGlow',
    partial: { neonGlow: 50, neonColor: '#ff00ff' },
  },
  zoomBlur: {
    name: 'Zoom Blur',
    icon: '◉',
    primary: 'zoomBlur',
    partial: { zoomBlur: 40 },
  },
  vhsTracking: {
    name: 'VHS Track',
    icon: '⊟',
    primary: 'vhsTracking',
    partial: { vhsTracking: 30 },
  },
  dither: {
    name: 'Dither',
    icon: '⠦',
    primary: 'dither',
    partial: { dither: 36 },
  },
  infrared: {
    name: 'Infrared',
    icon: '⊗',
    primary: 'infrared',
    partial: { infrared: 60 },
  },
  ca: {
    name: 'Chrom. Ab.',
    icon: '◫',
    primary: 'ca',
    partial: { ca: 15 },
  },
  wave: {
    name: 'Wave',
    icon: '〜',
    primary: 'waveAmt',
    partial: { waveAmt: 20, waveFreq: 3 },
  },
  matte: {
    name: 'Matte',
    icon: '▩',
    primary: 'matte',
    partial: { matte: 40 },
  },
  overprint: {
    name: 'Overprint',
    icon: '⊕',
    primary: 'overprint',
    partial: { overprint: 20 },
  },
  solarize: {
    name: 'Solarize',
    icon: '☯',
    primary: 'solarize',
    partial: { solarize: 55 },
  },
  bleachBypass: {
    name: 'Bleach Bypass',
    icon: '⊙',
    primary: 'bleachBypass',
    partial: { bleachBypass: 65 },
  },
  cyanotype: {
    name: 'Cyanotype',
    icon: '⊆',
    primary: 'cyanotype',
    partial: { cyanotype: 75 },
  },
  splitTone: {
    name: 'Split Tone',
    icon: '◑',
    primary: 'splitToneAmt',
    partial: {
      splitToneAmt: 50,
      splitShadow: '#001a4f',
      splitHighlight: '#ff8040',
    },
  },
  ripple: {
    name: 'Ripple',
    icon: '≈',
    primary: 'rippleAmt',
    partial: { rippleAmt: 20, rippleFreq: 3 },
  },
  patternRefraction: {
    name: 'Pattern Refraction',
    icon: '∿',
    primary: 'patternRefraction',
    partial: { patternRefraction: 58, patternRefractionScale: 18, patternRefractionAngle: 35 },
  },
  kaleidoscope: {
    name: 'Kaleidoscope',
    icon: '❋',
    primary: 'kaleidoscope',
    partial: { kaleidoscope: 40 },
  },
  squeeze: {
    name: 'Squeeze',
    icon: '⊡',
    primary: null,
    partial: { squeezeX: 30, squeezeY: 0 },
  },
  emboss: {
    name: 'Emboss',
    icon: '▲',
    primary: 'emboss',
    partial: { emboss: 60 },
  },
  linocut: {
    name: 'Linocut',
    icon: '◰',
    primary: 'linocut',
    partial: { linocut: 55 },
  },
  fog: {
    name: 'Fog',
    icon: '≀',
    primary: 'fog',
    partial: { fog: 45, fogColor: '#c8d8e8' },
  },
  speedLines: {
    name: 'Speed Lines',
    icon: '≫',
    primary: 'speedLines',
    partial: { speedLines: 50 },
  },
};

export const EFFECT_PRESET_MENU_ORDER: EffectPreset[] = [
  'rays',
  'bloom',
  'filmBurn',
  'neonGlow',
  'fog',
  'speedLines',
  'shadow',
  'grimeShadow',
  'glitch',
  'rgbSplit',
  'ca',
  'interlace',
  'dataMosh',
  'vhsTracking',
  'badStream',
  'macroblocks',
  'detailBlocks',
  'blockSmear',
  'chromaBlocks',
  'blockDropout',
  'pixelStretch',
  'grain',
  'dotGrain',
  'scanlines',
  'matte',
  'dither',
  'emboss',
  'linocut',
  'tint',
  'noiseWarp',
  'morph',
  'vortex',
  'barrel',
  'tear',
  'mirror',
  'wave',
  'zoomBlur',
  'ripple',
  'patternRefraction',
  'kaleidoscope',
  'squeeze',
  'adjust',
  'hueShift',
  'vignette',
  'retroResolution',
  'pixelate',
  'posterize',
  'indexedPalette',
  'gradientMap',
  'channelMixer',
  'sepia',
  'infrared',
  'solarize',
  'bleachBypass',
  'cyanotype',
  'splitTone',
  'duotone',
  'halftone',
  'risoShift',
  'overprint',
  'blur',
  'sharpen',
  'threshold',
  'edgeCrush',
  'silhouetteCrush',
  'edgeDetect',
  'bokehBlur',
  'hatching',
  'gooeyMerge',
  'gradientOverlay',
];

export type EffectPresetOverrides = Partial<Omit<EffectLayer, 'kind' | 'preset'>> &
  Partial<KernelParamValues> & { value?: number };

export function makeEffectPresetLayer(preset: EffectPreset, overrides: EffectPresetOverrides = {}): EffectLayer {
  const { name, partial, primary } = EFFECT_PRESETS[preset];
  const { value, ...rest } = overrides;
  const { fields, params } = splitEffectLayerInit(rest);
  const valuePatch = value !== undefined && primary ? { [primary]: Math.max(0, Math.min(100, value)) } : {};
  const id = fields.id ?? genId();
  return {
    name,
    visible: true,
    locked: false,
    ...DEFAULT_EFFECT_LAYER_PROPS,
    effects: effectEntriesFromParams(id, { ...partial, ...valuePatch, ...params }, kernelOfPreset(preset)),
    ...fields,
    id,
    kind: 'effect',
    preset,
  };
}

/** The parameters "Add effect" starts an effect from: its starter preset's look. */
export function effectStarterParams(effect: EffectId): EffectParams {
  const preset = effectSpec(effect).starter;
  const kernel = kernelOfPreset(preset);
  return effectFromKernel(kernel, { ...KERNEL_PARAM_DEFAULTS, ...EFFECT_PRESETS[preset].partial }).params;
}
