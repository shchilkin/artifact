import { EFFECT_PRESET_MENU_ORDER, type EffectLayer, type EffectPreset } from '../../../types/config';
import { EFFECT_SECTIONS, type EffectControlSectionId, presetParamKeys } from '../../../types/effectSchema';
import type { EffectSectionId } from '../types';

/** Presets that show a control in this inspector section, in add-menu order. */
export function effectSectionPresets(section: EffectControlSectionId): EffectPreset[] {
  const params = new Set<string>(EFFECT_SECTIONS.find((item) => item.id === section)?.params ?? []);
  return EFFECT_PRESET_MENU_ORDER.filter((preset) => presetParamKeys(preset).some((key) => params.has(key)));
}

const EFFECT_SECTION_PRESETS = EFFECT_SECTIONS.map((section) => ({
  id: section.id,
  presets: effectSectionPresets(section.id),
}));

/** Presets with at least one inspector control. */
export const EFFECT_CONTROL_PRESETS = EFFECT_SECTION_PRESETS.flatMap((section) => section.presets);

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
