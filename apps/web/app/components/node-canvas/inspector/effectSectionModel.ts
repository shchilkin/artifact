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

export function initialEffectSection(layer: EffectLayer): EffectSectionId {
  if (layer.preset && RAYS_PRESETS.includes(layer.preset)) return 'rays';
  if (layer.preset && GLITCH_PRESETS.includes(layer.preset)) return 'glitch';
  if (layer.preset && TEXTURE_PRESETS.includes(layer.preset)) return 'texture';
  if (layer.preset && TINT_PRESETS.includes(layer.preset)) return 'tint';
  if (layer.preset && WARP_PRESETS.includes(layer.preset)) return 'warp';
  if (layer.preset && COLOR_PRESETS.includes(layer.preset)) return 'color';
  if (layer.preset && RISO_PRESETS.includes(layer.preset)) return 'riso';
  if (layer.preset && GRAPHIC_PRESETS.includes(layer.preset)) return 'graphic';
  return 'node';
}

export function effectSectionSummary(layer: EffectLayer, section: EffectSectionId): string {
  const preset = layer.preset;
  switch (section) {
    case 'node':
      return layer.preset ?? 'custom';
    case 'rays':
      if (preset === 'bloom') return `${layer.bloom}% bloom`;
      if (preset === 'filmBurn') return `${layer.filmBurn}% burn`;
      if (preset === 'neonGlow') return `${layer.neonGlow}% neon`;
      if (preset === 'fog') return `${layer.fog}% fog`;
      if (preset === 'speedLines') return `${layer.speedLines}% speed`;
      return `${layer.rays} rays`;
    case 'glitch':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} chroma`;
      if (preset === 'ca') return `${layer.ca} ca`;
      if (preset === 'interlace') return `${layer.interlace}% interlace`;
      if (preset === 'dataMosh') return `${layer.dataMosh}% mosh`;
      if (preset === 'vhsTracking') return `${layer.vhsTracking}% track`;
      return `${layer.glitch} / ${layer.rgbSplit}`;
    case 'texture':
      if (preset === 'scanlines') return `${layer.scanlines}% / ${layer.scanlineWidth ?? 1}px`;
      if (preset === 'matte') return `${layer.matte}% matte`;
      if (preset === 'dither') return `${layer.dither}% dither`;
      if (preset === 'emboss') return `${layer.emboss}% emboss`;
      if (preset === 'linocut') return `${layer.linocut}% lino`;
      return `${layer.grain}% grain`;
    case 'tint':
      return `${layer.tintOp}%`;
    case 'warp':
      if (preset === 'noiseWarp') return `${layer.noiseWarp}%`;
      if (preset === 'morph') return `${layer.morphAmt}% morph`;
      if (preset === 'vortex') return `${layer.vortex}% vortex`;
      if (preset === 'barrel') return `${layer.barrel}% barrel`;
      if (preset === 'tear') return `${layer.tearAmt} tear`;
      if (preset === 'mirror') return `${layer.mirror}x mirror`;
      if (preset === 'wave') return `${layer.waveAmt}% wave`;
      if (preset === 'zoomBlur') return `${layer.zoomBlur}% zoom`;
      if (preset === 'ripple') return `${layer.rippleAmt}% ripple`;
      if (preset === 'kaleidoscope') return `${layer.kaleidoscope}% kaleido`;
      if (preset === 'squeeze') return `${layer.squeezeX}/${layer.squeezeY}`;
      return `${layer.noiseWarp}%`;
    case 'color':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} split`;
      if (preset === 'vignette') return `${layer.vignette}% vignette`;
      if (preset === 'pixelate') return `${layer.pixelate}px blocks`;
      if (preset === 'posterize') return `${layer.posterize} bands`;
      if (preset === 'sepia') return `${layer.sepia}% sepia`;
      if (preset === 'infrared') return `${layer.infrared}% infrared`;
      if (preset === 'solarize') return `${layer.solarize}% solarize`;
      if (preset === 'bleachBypass') return `${layer.bleachBypass}% bleach`;
      if (preset === 'cyanotype') return `${layer.cyanotype}% cyan`;
      if (preset === 'splitTone') return `${layer.splitToneAmt}% split`;
      return `${layer.hueShift}deg`;
    case 'riso':
      if (preset === 'halftone') return `${layer.halftone} tone`;
      if (preset === 'risoShift') return `${layer.risoShift}px`;
      if (preset === 'overprint') return `${layer.overprint}% overprint`;
      return `${layer.duotone}%`;
    case 'graphic':
      if (preset === 'blur') return `${layer.blurAmt}px blur`;
      if (preset === 'threshold') return `${layer.threshold}% threshold`;
      if (preset === 'edgeDetect') return `${layer.edgeDetect}% edge`;
      return `${layer.gradMix}% mix`;
  }
}
