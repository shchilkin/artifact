import type { EffectLayer } from '../../../types/config';
import {
  COLOR_PRESETS,
  GLITCH_PRESETS,
  GRAPHIC_PRESETS,
  RAYS_PRESETS,
  RISO_PRESETS,
  TEXTURE_PRESETS,
  TINT_PRESETS,
  WARP_PRESETS,
} from '../constants';
import type { EffectSectionId } from '../types';

export const EFFECT_CONTROL_PRESETS = [
  ...RAYS_PRESETS,
  ...GLITCH_PRESETS,
  ...TEXTURE_PRESETS,
  ...TINT_PRESETS,
  ...WARP_PRESETS,
  ...COLOR_PRESETS,
  ...RISO_PRESETS,
  ...GRAPHIC_PRESETS,
];

const EFFECT_SECTION_PRESETS = [
  { id: 'rays', presets: RAYS_PRESETS },
  { id: 'glitch', presets: GLITCH_PRESETS },
  { id: 'texture', presets: TEXTURE_PRESETS },
  { id: 'tint', presets: TINT_PRESETS },
  { id: 'warp', presets: WARP_PRESETS },
  { id: 'color', presets: COLOR_PRESETS },
  { id: 'riso', presets: RISO_PRESETS },
  { id: 'graphic', presets: GRAPHIC_PRESETS },
] as const satisfies Array<{ id: EffectSectionId; presets: readonly EffectPresetId[] }>;

export function initialEffectSection(layer: EffectLayer): EffectSectionId {
  return EFFECT_SECTION_PRESETS.find((section) => layer.preset && section.presets.includes(layer.preset))?.id ?? 'node';
}

type EffectPresetId = NonNullable<EffectLayer['preset']>;
type SummaryGetter = (layer: EffectLayer) => string;

const FALLBACK_SUMMARIES: Record<EffectSectionId, SummaryGetter> = {
  node: (layer) => layer.preset ?? 'custom',
  rays: (layer) => `${layer.rays} rays`,
  glitch: (layer) => `${layer.glitch} / ${layer.rgbSplit}`,
  texture: (layer) => `${layer.grain}% grain`,
  tint: (layer) => `${layer.tintOp}%`,
  warp: (layer) => `${layer.noiseWarp}%`,
  color: (layer) => `${layer.hueShift}deg`,
  riso: (layer) => `${layer.duotone}%`,
  graphic: (layer) => `${layer.gradMix}% mix`,
};

const PRESET_SUMMARIES: Partial<Record<EffectSectionId, Partial<Record<EffectPresetId, SummaryGetter>>>> = {
  rays: {
    bloom: (layer) => `${layer.bloom}% bloom`,
    filmBurn: (layer) => `${layer.filmBurn}% burn`,
    fog: (layer) => `${layer.fog}% fog`,
    neonGlow: (layer) => `${layer.neonGlow}% neon`,
    speedLines: (layer) => `${layer.speedLines}% speed`,
  },
  glitch: {
    badStream: (layer) => `${layer.badStream}% stream`,
    blockDropout: (layer) => `${layer.badStreamDarkness}% dropout`,
    blockSmear: (layer) => `${layer.badStreamSmear}% smear`,
    ca: (layer) => `${layer.ca} ca`,
    chromaBlocks: (layer) => `${layer.badStreamChroma}% chroma`,
    dataMosh: (layer) => `${layer.dataMosh}% mosh`,
    detailBlocks: (layer) => `${layer.badStreamDetail}% detail`,
    interlace: (layer) => `${layer.interlace}% interlace`,
    macroblocks: (layer) => `${layer.badStreamBlockSize}px blocks`,
    pixelStretch: (layer) => `${layer.pixelStretch}% stretch`,
    rgbSplit: (layer) => `${layer.rgbSplit} chroma`,
    vhsTracking: (layer) => `${layer.vhsTracking}% track`,
  },
  texture: {
    dither: (layer) => `${layer.dither}% dither`,
    emboss: (layer) => `${layer.emboss}% emboss`,
    linocut: (layer) => `${layer.linocut}% lino`,
    matte: (layer) => `${layer.matte}% matte`,
    scanlines: (layer) => `${layer.scanlines}% / ${layer.scanlineWidth ?? 1}px`,
  },
  warp: {
    barrel: (layer) => `${layer.barrel}% barrel`,
    kaleidoscope: (layer) => `${layer.kaleidoscope}% kaleido`,
    mirror: (layer) => `${layer.mirror}x mirror`,
    morph: (layer) => `${layer.morphAmt}% morph`,
    noiseWarp: (layer) => `${layer.noiseWarp}%`,
    patternRefraction: (layer) => `${layer.patternRefraction}% refract`,
    ripple: (layer) => `${layer.rippleAmt}% ripple`,
    squeeze: (layer) => `${layer.squeezeX}/${layer.squeezeY}`,
    tear: (layer) => `${layer.tearAmt} tear`,
    vortex: (layer) => `${layer.vortex}% vortex`,
    wave: (layer) => `${layer.waveAmt}% wave`,
    zoomBlur: (layer) => `${layer.zoomBlur}% zoom`,
  },
  color: {
    bleachBypass: (layer) => `${layer.bleachBypass}% bleach`,
    cyanotype: (layer) => `${layer.cyanotype}% cyan`,
    infrared: (layer) => `${layer.infrared}% infrared`,
    indexedPalette: (layer) => `${layer.indexedPalette}% / ${layer.indexedPaletteCount} colors`,
    gradientMap: (layer) => `${layer.gradientMap}% map`,
    channelMixer: (layer) => `${layer.channelMixer}% mixer`,
    pixelate: (layer) => `${layer.pixelate}px blocks`,
    posterize: (layer) => `${layer.posterize} bands`,
    retroResolution: (layer) => `${layer.retroResolution}px edge`,
    rgbSplit: (layer) => `${layer.rgbSplit} split`,
    sepia: (layer) => `${layer.sepia}% sepia`,
    solarize: (layer) => `${layer.solarize}% solarize`,
    splitTone: (layer) => `${layer.splitToneAmt}% split`,
    vignette: (layer) => `${layer.vignette}% vignette`,
  },
  riso: {
    halftone: (layer) => `${layer.halftone} tone`,
    overprint: (layer) => `${layer.overprint}% overprint`,
    risoShift: (layer) => `${layer.risoShift}px`,
  },
  graphic: {
    blur: (layer) => `${layer.blurAmt}px blur`,
    edgeCrush: (layer) => `${layer.edgeCrush}% alpha`,
    silhouetteCrush: (layer) => `${layer.silhouetteCrush}% silhouette`,
    bokehBlur: (layer) => `${layer.bokehBlur}px bokeh`,
    hatching: (layer) => `${layer.hatching}% hatch`,
    gooeyMerge: (layer) => `${layer.gooeyMerge}% gooey`,
    edgeDetect: (layer) => `${layer.edgeDetect}% edge`,
    threshold: (layer) => `${layer.threshold}% threshold`,
  },
};

export function effectSectionSummary(layer: EffectLayer, section: EffectSectionId): string {
  const preset = layer.preset;
  const presetSummary = preset ? PRESET_SUMMARIES[section]?.[preset] : undefined;
  return (presetSummary ?? FALLBACK_SUMMARIES[section])(layer);
}
