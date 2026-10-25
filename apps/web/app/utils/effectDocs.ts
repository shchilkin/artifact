import type { EffectPreset } from '../types/config';
import {
  type EffectSliderValueFormat,
  type KernelParamKey,
  kernelParam,
  presetParamKeys,
} from '../types/effectKernels';

export interface EffectParamDoc {
  key: string;
  range: string;
}

export interface EffectDocInfo {
  description: string;
  params: EffectParamDoc[];
}

export const EFFECT_FAMILY_GUIDE = [
  {
    name: 'Texture',
    desc: 'Grain, dot grain, scanlines, matte, dither, emboss, and linocut add physical surface before or after image sources.',
  },
  {
    name: 'Distortion',
    desc: 'Noise warp, morph, wave, ripple, barrel, vortex, squeeze, and kaleidoscope bend composition geometry.',
  },
  {
    name: 'Color',
    desc: 'Tint, hue shift, indexed palette, duotone, infrared, sepia, cyanotype, split tone, and gradient overlay reshape palette.',
  },
  {
    name: 'Print',
    desc: 'Halftone, riso shift, overprint, posterize, threshold, alpha/silhouette crush, and linocut push artwork toward poster production.',
  },
  {
    name: 'Signal Damage',
    desc: 'Glitch, interlace, data mosh, Bad Stream, codec block nodes, RGB split, chromatic aberration, VHS tracking, retro resolution, and pixelate create media failure.',
  },
] as const;

interface EffectDocCopy {
  description: string;
  /** What a parameter does, shown after its range. */
  notes?: Partial<Record<KernelParamKey, string>>;
}

const EFFECT_DOC_COPY: Record<EffectPreset, EffectDocCopy> = {
  shadow: { description: 'A soft drop shadow under the visible shapes of the input.' },
  grimeShadow: { description: 'Stacked, dirty shadow layers built from the visible alpha.' },
  adjust: { description: 'Brightness, contrast, saturation, temperature, hue, and invert in one grade.' },
  sharpen: { description: 'Crisps edges by pushing each pixel away from its neighbours.' },
  rays: { description: 'Thick colored poster-burst beams from center.' },
  bloom: { description: 'Highlights bleed outward into surrounding pixels.' },
  filmBurn: { description: 'Overexposed edges and chemical flare.' },
  glitch: { description: 'Horizontal slice tears at random scan intervals.' },
  interlace: { description: 'Alternating rows offset like a CRT field artifact.' },
  dataMosh: { description: 'Block compression artifacts, repeated frame error.' },
  badStream: {
    description:
      'Low-bitrate stream failure: large macroblocks, smaller compression fragments, smearing, chroma drift, and dark dropped blocks.',
    notes: {
      badStream: 'compression strength',
      badStreamBlockSize: 'macroblock size',
      badStreamDetail: 'small block amount',
      badStreamSmear: 'copied block smear',
      badStreamChroma: 'color drift',
      badStreamDarkness: 'dark dropout pressure',
    },
  },
  macroblocks: {
    description: 'Large video-codec squares with averaged color and optional dark pressure.',
    notes: { badStream: 'block opacity', badStreamBlockSize: 'macroblock size', badStreamDarkness: 'dark pressure' },
  },
  detailBlocks: {
    description: 'Small codec fragments for crunchy low-bitrate texture inside the frame.',
    notes: {
      badStream: 'compression strength',
      badStreamBlockSize: 'parent block size',
      badStreamDetail: 'small block amount',
      badStreamDarkness: 'dark edge pressure',
    },
  },
  blockSmear: {
    description: 'Copied neighboring blocks that smear the frame like a stalled stream.',
    notes: { badStream: 'smear opacity', badStreamBlockSize: 'block size', badStreamSmear: 'copied block smear' },
  },
  chromaBlocks: {
    description: 'Blocky chroma compression and color drift, separate from RGB split.',
    notes: {
      badStream: 'chroma opacity',
      badStreamBlockSize: 'block size',
      badStreamChroma: 'color drift',
      badStreamDetail: 'small chroma block amount',
    },
  },
  blockDropout: {
    description: 'Dark dropped blocks, like missing packets in a damaged stream.',
    notes: { badStream: 'dropout coverage', badStreamBlockSize: 'dropout size', badStreamDarkness: 'dropout darkness' },
  },
  grain: {
    description:
      'Photographic overlay grain across the full frame. For editable texture branches, use a Noise source set to Film Grain.',
    notes: { grain: 'amount' },
  },
  dotGrain: {
    description: 'Round tone-aware stipple dots for old-render shadows and PS-era texture.',
    notes: { dotGrain: 'amount', dotGrainSize: 'dot size' },
  },
  scanlines: { description: 'CRT phosphor bands with adjustable opacity and thickness.' },
  tint: { description: 'Flat color overlay at variable opacity.' },
  noiseWarp: { description: 'Displacement mapped by layered Perlin noise.' },
  morph: { description: 'Sine-wave surface distortion.' },
  vortex: { description: 'Rotational warp strongest at center.' },
  barrel: { description: 'Radial lens distortion, concave or convex.' },
  tear: { description: 'Horizontal row shift at random positions.' },
  mirror: { description: 'Fold the frame: horizontal, vertical, or both.' },
  hueShift: { description: 'Rotate all hue values by a fixed degree.' },
  rgbSplit: { description: 'RGB channels split diagonally.' },
  vignette: { description: 'Corner darkening that pulls the eye to center.' },
  retroResolution: {
    description:
      'Renders the upstream branch at a fixed low internal resolution in base cover pixels, then nearest-upscales it. Unlike Pixelate, export scale does not change the apparent pixel grid.',
    notes: { retroResolution: 'base longest edge' },
  },
  pixelate: {
    description: 'Downscale then upscale the whole image for a deliberate low-resolution block treatment.',
    notes: { pixelate: 'block size' },
  },
  posterize: { description: 'Quantize color values to a fixed step count.' },
  indexedPalette: {
    description: 'Map visible pixels to the nearest color in a small editable palette while preserving transparency.',
    notes: {
      indexedPalette: 'palette mix',
      indexedPaletteCount: 'active colors',
      indexedColorA: 'swatch 1',
      indexedColorB: 'swatch 2',
      indexedColorC: 'swatch 3',
      indexedColorD: 'swatch 4',
      indexedColorE: 'swatch 5',
      indexedColorF: 'swatch 6',
    },
  },
  duotone: { description: 'Map luminance to two chosen colors.' },
  halftone: { description: 'Simulate print dots at configurable frequency.', notes: { halftone: 'dot scale' } },
  risoShift: { description: 'Color channels shifted as if mis-fed through a press.', notes: { risoShift: 'shift' } },
  blur: { description: 'Gaussian blur across the entire frame.' },
  threshold: {
    description:
      'Luminance cutoff to stark black and white. 0 disables the pass; higher values require brighter pixels to stay white.',
    notes: { threshold: 'cutoff' },
  },
  edgeDetect: {
    description: 'Find contrast boundaries and blend them back as grayscale contour linework.',
    notes: { edgeDetect: 'linework mix' },
  },
  edgeCrush: {
    description: 'Crush semi-transparent antialiasing into hard alpha edges for cutout-style compositing.',
    notes: { edgeCrush: 'alpha edge hardening' },
  },
  silhouetteCrush: {
    description: 'Chip alpha-mask and high-contrast borders into jagged sprite-like silhouettes.',
    notes: { silhouetteCrush: 'silhouette border chipping' },
  },
  bokehBlur: {
    description: 'Lens-like blur with highlight lift around brighter source pixels.',
    notes: { bokehBlur: 'blur radius', bokehThreshold: 'highlight gate' },
  },
  hatching: {
    description: 'Tone-aware hatch linework over darker source regions.',
    notes: { hatching: 'line mix', hatchScale: 'line spacing', hatchAngle: 'line angle' },
  },
  gooeyMerge: {
    description: 'Blur-and-threshold alpha merge for nearby visible source shapes.',
    notes: { gooeyMerge: 'merge mix', gooeyRadius: 'alpha blur radius', gooeyThreshold: 'alpha threshold' },
  },
  gradientOverlay: {
    description: 'Directional two-color ramp blended over the source while preserving source alpha.',
    notes: { gradMix: 'overlay mix', gradA: 'start color', gradB: 'end color', gradAngle: 'direction' },
  },
  gradientMap: {
    description: 'Map source luminance through a three-color ramp, then blend it back over the original.',
    notes: {
      gradientMap: 'map mix',
      gradientMapShadow: 'shadow color',
      gradientMapMid: 'midtone color',
      gradientMapHighlight: 'highlight color',
    },
  },
  channelMixer: {
    description: 'Crossfeed RGB channels into each other for matrix-like color separation.',
    notes: {
      channelMixer: 'mixer mix',
      channelRedMix: 'red channel crossfeed',
      channelGreenMix: 'green channel crossfeed',
      channelBlueMix: 'blue channel crossfeed',
    },
  },
  patternRefraction: {
    description: 'Refract the source through a repeating wave pattern.',
    notes: {
      patternRefraction: 'refraction mix',
      patternRefractionScale: 'pattern scale',
      patternRefractionAngle: 'pattern angle',
    },
  },
  sepia: { description: 'Warm monochrome tone, classic darkroom look.' },
  neonGlow: { description: 'Bright edges bloom with a saturated chromatic halo.' },
  zoomBlur: { description: 'Radial motion blur expanding from center.' },
  vhsTracking: { description: 'Horizontal band desync like VHS tape dropout.' },
  pixelStretch: {
    description: 'Directional source-pixel streaking for stretched scanline artifacts.',
    notes: { pixelStretch: 'stretch mix', pixelStretchLength: 'sample length', pixelStretchAngle: 'stretch angle' },
  },
  dither: { description: 'Bayer ordered dithering reduces the color palette visibly.', notes: { dither: 'amount' } },
  infrared: { description: 'Channel swap shifts green to red, simulating IR film.' },
  ca: { description: 'Radial chromatic aberration creates lens fringe at edges.' },
  wave: { description: 'Sine-wave horizontal displacement scanned per row.' },
  matte: { description: 'Low-scale paper or canvas texture overlay.' },
  overprint: { description: 'CMYK plate offset with ink-on-ink misregistration.' },
  solarize: {
    description:
      'Inverts pixels above a moving brightness threshold. Low values affect only highlights; high values pull midtones into the negative break.',
    notes: { solarize: 'threshold depth' },
  },
  bleachBypass: {
    description:
      'Simulates skipped film bleach by reducing saturation, lifting harsh contrast, and pushing shadows harder.',
    notes: { bleachBypass: 'strength' },
  },
  cyanotype: { description: 'Prussian blue photographic print process on ivory paper.' },
  splitTone: { description: 'Shadow/highlight color grade with independent color choices.' },
  ripple: { description: 'Radial sine displacement from center for concentric wave distortion.' },
  kaleidoscope: { description: 'Mirror-fold into repeating radial segments.' },
  squeeze: { description: 'Anamorphic stretch or compression along each axis.' },
  emboss: { description: 'Diagonal convolution relief for raised surface texture.' },
  linocut: { description: 'Bayer-dithered posterization for bold graphic print texture.' },
  fog: {
    description: 'Colored haze that fills highlights first and softens the source without changing alpha.',
    notes: { fog: 'haze strength', fogColor: 'haze color' },
  },
  speedLines: { description: 'Thin white radial streaks from center for manga motion.' },
};

const RANGE_UNITS: Partial<Record<EffectSliderValueFormat, string>> = { px: 'px', deg: '°' };

/** A parameter's documented range, from its inspector control. */
function effectParamRange(key: KernelParamKey, note: string | undefined): string {
  const param = kernelParam(key);
  let range = 'hex';
  if (param.type === 'number') {
    const unit = (param.format && RANGE_UNITS[param.format]) ?? '';
    range = `${param.min}-${param.max}${unit}`;
    if (param.overrideMax !== undefined) range += ` slider, ${param.overrideMax}${unit} manual`;
  }
  return note ? `${range} ${note}` : range;
}

/** Docs for each focused preset: its description and the parameters it shows, with ranges from the schema. */
export const EFFECT_DOCS = Object.fromEntries(
  (Object.keys(EFFECT_DOC_COPY) as EffectPreset[]).map((preset) => {
    const { description, notes = {} } = EFFECT_DOC_COPY[preset];
    const params = presetParamKeys(preset).map((key) => ({ key, range: effectParamRange(key, notes[key]) }));
    return [preset, { description, params }];
  }),
) as Record<EffectPreset, EffectDocInfo>;
