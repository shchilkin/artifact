/** Focused effect presets: the layer defaults, preset metadata, menu order, and preset layer factories. */
import type { EffectLayer } from './config';
import { EFFECT_PARAM_DEFAULTS } from './effectSchema';
import { genId } from './layerIds';

export type EffectPreset =
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
  maskAlpha: false,
  ...EFFECT_PARAM_DEFAULTS,
  seedOffset: 0,
};

export function makeEffectLayer(partial: Partial<EffectLayer> = {}): EffectLayer {
  return {
    id: genId(),
    name: 'Effect',
    visible: true,
    locked: false,
    ...DEFAULT_EFFECT_LAYER_PROPS,
    ...partial,
  };
}

function omitEffectKind(
  props: typeof DEFAULT_EFFECT_LAYER_PROPS,
): Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked' | 'kind'> {
  const { kind, ...rest } = props;
  void kind;
  return rest;
}

// All-zero base for focused single-effect layers
export const ZERO_EFFECT = omitEffectKind(DEFAULT_EFFECT_LAYER_PROPS);

export type EffectNumericField = {
  [K in keyof EffectLayer]-?: EffectLayer[K] extends number ? K : never;
}[keyof EffectLayer];

export interface EffectPresetMeta {
  name: string;
  icon: string;
  partial: Partial<EffectLayer>;
  primary: EffectNumericField | null;
}

export const EFFECT_PRESETS: Record<EffectPreset, EffectPresetMeta> = {
  rays: {
    name: 'Rays',
    icon: '✶',
    primary: 'rays',
    partial: { ...ZERO_EFFECT, rays: 16, rayInt: 65, rayColor: '#bb00ff' },
  },
  bloom: {
    name: 'Bloom',
    icon: '✹',
    primary: 'bloom',
    partial: { ...ZERO_EFFECT, bloom: 30 },
  },
  filmBurn: {
    name: 'Film Burn',
    icon: '☼',
    primary: 'filmBurn',
    partial: { ...ZERO_EFFECT, filmBurn: 35 },
  },
  glitch: {
    name: 'Glitch',
    icon: '▒',
    primary: 'glitch',
    partial: { ...ZERO_EFFECT, glitch: 14 },
  },
  interlace: {
    name: 'Interlace',
    icon: '≋',
    primary: 'interlace',
    partial: { ...ZERO_EFFECT, interlace: 40 },
  },
  dataMosh: {
    name: 'Data Mosh',
    icon: '▥',
    primary: 'dataMosh',
    partial: { ...ZERO_EFFECT, dataMosh: 30 },
  },
  badStream: {
    name: 'Bad Stream',
    icon: '▧',
    primary: 'badStream',
    partial: {
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
    partial: { ...ZERO_EFFECT, pixelStretch: 70, pixelStretchLength: 34, pixelStretchAngle: 0 },
  },
  grain: {
    name: 'Grain',
    icon: '⣿',
    primary: 'grain',
    partial: { ...ZERO_EFFECT, grain: 26 },
  },
  dotGrain: {
    name: 'Dot Grain',
    icon: '◌',
    primary: 'dotGrain',
    partial: { ...ZERO_EFFECT, dotGrain: 68, dotGrainSize: 4, dotGrainDensity: 66, dotGrainJitter: 42 },
  },
  scanlines: {
    name: 'Scanlines',
    icon: '☰',
    primary: 'scanlines',
    partial: { ...ZERO_EFFECT, scanlines: 18, scanlineWidth: 1 },
  },
  tint: {
    name: 'Tint',
    icon: '◈',
    primary: 'tintOp',
    partial: { ...ZERO_EFFECT, tint: '#350055', tintOp: 45 },
  },
  noiseWarp: {
    name: 'Noise Warp',
    icon: '◌',
    primary: 'noiseWarp',
    partial: { ...ZERO_EFFECT, noiseWarp: 40 },
  },
  morph: {
    name: 'Morph',
    icon: '∿',
    primary: null,
    partial: { ...ZERO_EFFECT, morphAmt: 30, morphFreq: 5 },
  },
  vortex: {
    name: 'Vortex',
    icon: '◍',
    primary: 'vortex',
    partial: { ...ZERO_EFFECT, vortex: 20 },
  },
  barrel: {
    name: 'Barrel',
    icon: '◔',
    primary: 'barrel',
    partial: { ...ZERO_EFFECT, barrel: 25 },
  },
  tear: {
    name: 'Tear',
    icon: '╱',
    primary: 'tearAmt',
    partial: { ...ZERO_EFFECT, tearAmt: 8, tearSize: 3 },
  },
  mirror: {
    name: 'Mirror',
    icon: '║',
    primary: null,
    partial: { ...ZERO_EFFECT, mirror: 1 },
  },
  hueShift: {
    name: 'Hue Shift',
    icon: '◐',
    primary: 'hueShift',
    partial: { ...ZERO_EFFECT, hueShift: 60 },
  },
  rgbSplit: {
    name: 'RGB Split',
    icon: '◭',
    primary: 'rgbSplit',
    partial: { ...ZERO_EFFECT, rgbSplit: 8 },
  },
  vignette: {
    name: 'Vignette',
    icon: '◜',
    primary: 'vignette',
    partial: { ...ZERO_EFFECT, vignette: 40 },
  },
  retroResolution: {
    name: 'Retro Resolution',
    icon: '▣',
    primary: 'retroResolution',
    partial: { ...ZERO_EFFECT, retroResolution: 320 },
  },
  pixelate: {
    name: 'Pixelate',
    icon: '▦',
    primary: 'pixelate',
    partial: { ...ZERO_EFFECT, pixelate: 6 },
  },
  posterize: {
    name: 'Posterize',
    icon: '◨',
    primary: 'posterize',
    partial: { ...ZERO_EFFECT, posterize: 6 },
  },
  indexedPalette: {
    name: 'Indexed Palette',
    icon: '▥',
    primary: 'indexedPalette',
    partial: {
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
      ...ZERO_EFFECT,
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
    partial: { ...ZERO_EFFECT, duotone: 60, duoA: '#0a0020', duoB: '#ff6ec7' },
  },
  halftone: {
    name: 'Halftone',
    icon: '◩',
    primary: 'halftone',
    partial: { ...ZERO_EFFECT, halftone: 12 },
  },
  risoShift: {
    name: 'Misregister',
    icon: '⟲',
    primary: 'risoShift',
    partial: { ...ZERO_EFFECT, risoShift: 14, risoAngle: 15 },
  },
  blur: {
    name: 'Blur',
    icon: '◯',
    primary: 'blurAmt',
    partial: { ...ZERO_EFFECT, blurAmt: 30 },
  },
  threshold: {
    name: 'Threshold',
    icon: '◐',
    primary: 'threshold',
    partial: { ...ZERO_EFFECT, threshold: 50 },
  },
  edgeCrush: {
    name: 'Alpha Crush',
    icon: '◈',
    primary: 'edgeCrush',
    partial: { ...ZERO_EFFECT, edgeCrush: 55 },
  },
  silhouetteCrush: {
    name: 'Silhouette Crush',
    icon: '◆',
    primary: 'silhouetteCrush',
    partial: { ...ZERO_EFFECT, silhouetteCrush: 55 },
  },
  edgeDetect: {
    name: 'Edge Detect',
    icon: '◇',
    primary: 'edgeDetect',
    partial: { ...ZERO_EFFECT, edgeDetect: 60 },
  },
  bokehBlur: {
    name: 'Bokeh Blur',
    icon: '◎',
    primary: 'bokehBlur',
    partial: { ...ZERO_EFFECT, bokehBlur: 12, bokehThreshold: 68 },
  },
  hatching: {
    name: 'Hatching',
    icon: '≋',
    primary: 'hatching',
    partial: { ...ZERO_EFFECT, hatching: 65, hatchScale: 9, hatchAngle: 35 },
  },
  gooeyMerge: {
    name: 'Gooey Merge',
    icon: '●',
    primary: 'gooeyMerge',
    partial: { ...ZERO_EFFECT, gooeyMerge: 72, gooeyRadius: 10, gooeyThreshold: 42 },
  },
  gradientOverlay: {
    name: 'Gradient',
    icon: '▤',
    primary: 'gradMix',
    partial: {
      ...ZERO_EFFECT,
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
    partial: { ...ZERO_EFFECT, sepia: 65 },
  },
  neonGlow: {
    name: 'Neon Glow',
    icon: '✦',
    primary: 'neonGlow',
    partial: { ...ZERO_EFFECT, neonGlow: 50, neonColor: '#ff00ff' },
  },
  zoomBlur: {
    name: 'Zoom Blur',
    icon: '◉',
    primary: 'zoomBlur',
    partial: { ...ZERO_EFFECT, zoomBlur: 40 },
  },
  vhsTracking: {
    name: 'VHS Track',
    icon: '⊟',
    primary: 'vhsTracking',
    partial: { ...ZERO_EFFECT, vhsTracking: 30 },
  },
  dither: {
    name: 'Dither',
    icon: '⠦',
    primary: 'dither',
    partial: { ...ZERO_EFFECT, dither: 36 },
  },
  infrared: {
    name: 'Infrared',
    icon: '⊗',
    primary: 'infrared',
    partial: { ...ZERO_EFFECT, infrared: 60 },
  },
  ca: {
    name: 'Chrom. Ab.',
    icon: '◫',
    primary: 'ca',
    partial: { ...ZERO_EFFECT, ca: 15 },
  },
  wave: {
    name: 'Wave',
    icon: '〜',
    primary: 'waveAmt',
    partial: { ...ZERO_EFFECT, waveAmt: 20, waveFreq: 3 },
  },
  matte: {
    name: 'Matte',
    icon: '▩',
    primary: 'matte',
    partial: { ...ZERO_EFFECT, matte: 40 },
  },
  overprint: {
    name: 'Overprint',
    icon: '⊕',
    primary: 'overprint',
    partial: { ...ZERO_EFFECT, overprint: 20 },
  },
  solarize: {
    name: 'Solarize',
    icon: '☯',
    primary: 'solarize',
    partial: { ...ZERO_EFFECT, solarize: 55 },
  },
  bleachBypass: {
    name: 'Bleach Bypass',
    icon: '⊙',
    primary: 'bleachBypass',
    partial: { ...ZERO_EFFECT, bleachBypass: 65 },
  },
  cyanotype: {
    name: 'Cyanotype',
    icon: '⊆',
    primary: 'cyanotype',
    partial: { ...ZERO_EFFECT, cyanotype: 75 },
  },
  splitTone: {
    name: 'Split Tone',
    icon: '◑',
    primary: 'splitToneAmt',
    partial: {
      ...ZERO_EFFECT,
      splitToneAmt: 50,
      splitShadow: '#001a4f',
      splitHighlight: '#ff8040',
    },
  },
  ripple: {
    name: 'Ripple',
    icon: '≈',
    primary: 'rippleAmt',
    partial: { ...ZERO_EFFECT, rippleAmt: 20, rippleFreq: 3 },
  },
  patternRefraction: {
    name: 'Pattern Refraction',
    icon: '∿',
    primary: 'patternRefraction',
    partial: { ...ZERO_EFFECT, patternRefraction: 58, patternRefractionScale: 18, patternRefractionAngle: 35 },
  },
  kaleidoscope: {
    name: 'Kaleidoscope',
    icon: '❋',
    primary: 'kaleidoscope',
    partial: { ...ZERO_EFFECT, kaleidoscope: 40 },
  },
  squeeze: {
    name: 'Squeeze',
    icon: '⊡',
    primary: null,
    partial: { ...ZERO_EFFECT, squeezeX: 30, squeezeY: 0 },
  },
  emboss: {
    name: 'Emboss',
    icon: '▲',
    primary: 'emboss',
    partial: { ...ZERO_EFFECT, emboss: 60 },
  },
  linocut: {
    name: 'Linocut',
    icon: '◰',
    primary: 'linocut',
    partial: { ...ZERO_EFFECT, linocut: 55 },
  },
  fog: {
    name: 'Fog',
    icon: '≀',
    primary: 'fog',
    partial: { ...ZERO_EFFECT, fog: 45, fogColor: '#c8d8e8' },
  },
  speedLines: {
    name: 'Speed Lines',
    icon: '≫',
    primary: 'speedLines',
    partial: { ...ZERO_EFFECT, speedLines: 50 },
  },
};

export const EFFECT_PRESET_MENU_ORDER: EffectPreset[] = [
  'rays',
  'bloom',
  'filmBurn',
  'neonGlow',
  'fog',
  'speedLines',
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
  'threshold',
  'edgeCrush',
  'silhouetteCrush',
  'edgeDetect',
  'bokehBlur',
  'hatching',
  'gooeyMerge',
  'gradientOverlay',
];

export type EffectPresetOverrides = Partial<Omit<EffectLayer, 'kind' | 'preset'>> & { value?: number };

export function makeEffectPresetLayer(preset: EffectPreset, overrides: EffectPresetOverrides = {}): EffectLayer {
  const { name, partial, primary } = EFFECT_PRESETS[preset];
  const { value, ...rest } = overrides;
  const valuePatch = value !== undefined && primary ? { [primary]: Math.max(0, Math.min(100, value)) } : {};
  return {
    id: genId(),
    name,
    visible: true,
    locked: false,
    ...ZERO_EFFECT,
    ...partial,
    ...valuePatch,
    ...rest,
    kind: 'effect',
    preset,
  };
}
