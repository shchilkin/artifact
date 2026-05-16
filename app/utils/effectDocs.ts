import type { EffectPreset } from '../types/config';

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
    desc: 'Grain, scanlines, matte, dither, emboss, and linocut add physical surface before or after image sources.',
  },
  {
    name: 'Distortion',
    desc: 'Noise warp, morph, wave, ripple, barrel, vortex, squeeze, and kaleidoscope bend composition geometry.',
  },
  {
    name: 'Color',
    desc: 'Tint, hue shift, duotone, infrared, sepia, cyanotype, split tone, and gradient overlay reshape palette.',
  },
  {
    name: 'Print',
    desc: 'Halftone, riso shift, overprint, posterize, threshold, and linocut push artwork toward poster production.',
  },
  {
    name: 'Signal Damage',
    desc: 'Glitch, interlace, data mosh, RGB split, chromatic aberration, VHS tracking, and pixelate create media failure.',
  },
] as const;

export const EFFECT_DOCS: Record<EffectPreset, EffectDocInfo> = {
  rays: {
    description: 'Thick colored poster-burst beams from center.',
    params: [
      { key: 'rays', range: '0-240 manual' },
      { key: 'rayInt', range: '0-100' },
      { key: 'rayColor', range: 'hex' },
    ],
  },
  bloom: {
    description: 'Highlights bleed outward into surrounding pixels.',
    params: [{ key: 'bloom', range: '0-100' }],
  },
  filmBurn: {
    description: 'Overexposed edges and chemical flare.',
    params: [{ key: 'filmBurn', range: '0-100' }],
  },
  glitch: {
    description: 'Horizontal slice tears at random scan intervals.',
    params: [{ key: 'glitch', range: '0-100' }],
  },
  interlace: {
    description: 'Alternating rows offset like a CRT field artifact.',
    params: [{ key: 'interlace', range: '0-100' }],
  },
  dataMosh: {
    description: 'Block compression artifacts, repeated frame error.',
    params: [{ key: 'dataMosh', range: '0-100' }],
  },
  grain: {
    description:
      'Photographic overlay grain across the full frame. For editable texture branches, use a Noise source set to Film Grain.',
    params: [{ key: 'grain', range: '0-100 amount' }],
  },
  scanlines: {
    description: 'CRT phosphor bands with adjustable opacity and thickness.',
    params: [
      { key: 'scanlines', range: '0-100' },
      { key: 'scanlineWidth', range: '1-12px' },
    ],
  },
  tint: {
    description: 'Flat color overlay at variable opacity.',
    params: [
      { key: 'tint', range: 'hex' },
      { key: 'tintOp', range: '0-100' },
    ],
  },
  noiseWarp: {
    description: 'Displacement mapped by layered Perlin noise.',
    params: [{ key: 'noiseWarp', range: '0-100' }],
  },
  morph: {
    description: 'Sine-wave surface distortion.',
    params: [
      { key: 'morphAmt', range: '0-100' },
      { key: 'morphFreq', range: '1-20' },
    ],
  },
  vortex: {
    description: 'Rotational warp strongest at center.',
    params: [{ key: 'vortex', range: '0-100' }],
  },
  barrel: {
    description: 'Radial lens distortion, concave or convex.',
    params: [{ key: 'barrel', range: '0-100' }],
  },
  tear: {
    description: 'Horizontal row shift at random positions.',
    params: [
      { key: 'tearAmt', range: '0-100' },
      { key: 'tearSize', range: '1-20' },
    ],
  },
  mirror: { description: 'Fold the frame: horizontal, vertical, or both.', params: [{ key: 'mirror', range: '0-3' }] },
  hueShift: {
    description: 'Rotate all hue values by a fixed degree.',
    params: [{ key: 'hueShift', range: '0-360' }],
  },
  rgbSplit: { description: 'RGB channels split diagonally.', params: [{ key: 'rgbSplit', range: '0-100' }] },
  vignette: {
    description: 'Corner darkening that pulls the eye to center.',
    params: [{ key: 'vignette', range: '0-100' }],
  },
  pixelate: {
    description: 'Downscale then upscale for pixel block texture.',
    params: [{ key: 'pixelate', range: '0-100' }],
  },
  posterize: {
    description: 'Quantize color values to a fixed step count.',
    params: [{ key: 'posterize', range: '0-20' }],
  },
  duotone: {
    description: 'Map luminance to two chosen colors.',
    params: [
      { key: 'duotone', range: '0-100' },
      { key: 'duoA', range: 'hex' },
      { key: 'duoB', range: 'hex' },
    ],
  },
  halftone: {
    description: 'Simulate print dots at configurable frequency.',
    params: [{ key: 'halftone', range: '0-100' }],
  },
  risoShift: {
    description: 'Color channels shifted as if mis-fed through a press.',
    params: [
      { key: 'risoShift', range: '0-100' },
      { key: 'risoAngle', range: '0-360' },
    ],
  },
  blur: { description: 'Gaussian blur across the entire frame.', params: [{ key: 'blurAmt', range: '0-100' }] },
  threshold: {
    description: 'Luminance cutoff to stark black and white.',
    params: [{ key: 'threshold', range: '0-100' }],
  },
  edgeDetect: {
    description: 'Highlight edge transitions with a convolution kernel.',
    params: [{ key: 'edgeDetect', range: '0-100' }],
  },
  gradientOverlay: {
    description: 'Two-color gradient blended over the frame.',
    params: [
      { key: 'gradMix', range: '0-100' },
      { key: 'gradA', range: 'hex' },
      { key: 'gradB', range: 'hex' },
      { key: 'gradAngle', range: '0-360' },
    ],
  },
  sepia: { description: 'Warm monochrome tone, classic darkroom look.', params: [{ key: 'sepia', range: '0-100' }] },
  neonGlow: {
    description: 'Bright edges bloom with a saturated chromatic halo.',
    params: [
      { key: 'neonGlow', range: '0-100' },
      { key: 'neonColor', range: 'hex' },
    ],
  },
  zoomBlur: {
    description: 'Radial motion blur expanding from center.',
    params: [{ key: 'zoomBlur', range: '0-100' }],
  },
  vhsTracking: {
    description: 'Horizontal band desync like VHS tape dropout.',
    params: [{ key: 'vhsTracking', range: '0-100' }],
  },
  dither: {
    description: 'Bayer ordered dithering reduces the color palette visibly.',
    params: [{ key: 'dither', range: '0-100' }],
  },
  infrared: {
    description: 'Channel swap shifts green to red, simulating IR film.',
    params: [{ key: 'infrared', range: '0-100' }],
  },
  ca: {
    description: 'Radial chromatic aberration creates lens fringe at edges.',
    params: [{ key: 'ca', range: '0-30' }],
  },
  wave: {
    description: 'Sine-wave horizontal displacement scanned per row.',
    params: [
      { key: 'waveAmt', range: '0-60' },
      { key: 'waveFreq', range: '1-12' },
    ],
  },
  matte: {
    description: 'Low-scale paper or canvas texture overlay.',
    params: [{ key: 'matte', range: '0-100' }],
  },
  overprint: {
    description: 'CMYK plate offset with ink-on-ink misregistration.',
    params: [{ key: 'overprint', range: '0-100' }],
  },
  solarize: {
    description: 'Luminance above threshold inverts to a surreal negative.',
    params: [{ key: 'solarize', range: '0-100' }],
  },
  bleachBypass: {
    description: 'Desaturated overlay blend with contrast and shadow crush.',
    params: [{ key: 'bleachBypass', range: '0-100' }],
  },
  cyanotype: {
    description: 'Prussian blue photographic print process on ivory paper.',
    params: [{ key: 'cyanotype', range: '0-100' }],
  },
  splitTone: {
    description: 'Shadow/highlight color grade with independent color choices.',
    params: [
      { key: 'splitToneAmt', range: '0-100' },
      { key: 'splitShadow', range: 'hex' },
      { key: 'splitHighlight', range: 'hex' },
    ],
  },
  ripple: {
    description: 'Radial sine displacement from center for concentric wave distortion.',
    params: [
      { key: 'rippleAmt', range: '0-100' },
      { key: 'rippleFreq', range: '1-12' },
    ],
  },
  kaleidoscope: {
    description: 'Mirror-fold into repeating radial segments.',
    params: [{ key: 'kaleidoscope', range: '0-100' }],
  },
  squeeze: {
    description: 'Anamorphic stretch or compression along each axis.',
    params: [
      { key: 'squeezeX', range: '-80-80' },
      { key: 'squeezeY', range: '-80-80' },
    ],
  },
  emboss: {
    description: 'Diagonal convolution relief for raised surface texture.',
    params: [{ key: 'emboss', range: '0-100' }],
  },
  linocut: {
    description: 'Bayer-dithered posterization for bold graphic print texture.',
    params: [{ key: 'linocut', range: '0-100' }],
  },
  fog: {
    description: 'Luminance-weighted haze overlay for soft atmospheric mist.',
    params: [
      { key: 'fog', range: '0-100' },
      { key: 'fogColor', range: 'hex' },
    ],
  },
  speedLines: {
    description: 'Thin white radial streaks from center for manga motion.',
    params: [{ key: 'speedLines', range: '0-300 manual' }],
  },
};
