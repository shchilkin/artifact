import type { CanvasDocument, EffectLayer } from '../types/config';
import { DEFAULT_EXPORT, makeEmojiLayer } from '../types/config';
import { splitEffectPatchIntoPresetLayers } from './effectLayerMigration';
import { renderDocument } from './renderer';

export interface EffectMeta {
  title: string;
  description: string;
  valueLabel: string;
  cfgOverride: Partial<EffectLayer>;
  family?: EffectFamilyId;
  goodFor?: string;
}

const BASE_SEED = 12345;

const BASE_EMOJI_LAYER = makeEmojiLayer({
  id: 'effect-info-emoji',
  emojis: ['💔', '👽', '✦', '🔥'],
  density: 30,
  minSz: 24,
  maxSz: 72,
  blur: 40,
});

const BASE_EFFECT: Partial<EffectLayer> = {
  grain: 0,
  scanlines: 0,
  scanlineWidth: 1,
  rayInt: 50,
  rayColor: '#bb00ff',
  rays: 10,
  rgbSplit: 0,
  glitch: 0,
  tint: '#350055',
  tintOp: 20,
  morphAmt: 0,
  morphFreq: 5,
  tearAmt: 0,
  tearSize: 3,
  noiseWarp: 0,
  vortex: 0,
  barrel: 0,
  mirror: 0,
  dataMosh: 0,
  interlace: 0,
  pixelate: 0,
  hueShift: 0,
  vignette: 0,
  bloom: 0,
  posterize: 0,
  filmBurn: 0,
  duotone: 0,
  duoA: '#0a0020',
  duoB: '#ff6ec7',
  halftone: 0,
  risoShift: 0,
  risoAngle: 15,
  blurAmt: 0,
  threshold: 0,
  edgeDetect: 0,
  gradMix: 0,
  gradA: '#0a0020',
  gradB: '#ff6ec7',
  gradAngle: 0,
  sepia: 0,
  neonGlow: 0,
  neonColor: '#ff00ff',
  zoomBlur: 0,
  vhsTracking: 0,
  dither: 0,
  infrared: 0,
  ca: 0,
  waveAmt: 0,
  waveFreq: 3,
  matte: 0,
  overprint: 0,
  solarize: 0,
  bleachBypass: 0,
  cyanotype: 0,
  splitToneAmt: 0,
  splitShadow: '#001a4f',
  splitHighlight: '#ff8040',
  rippleAmt: 0,
  rippleFreq: 3,
  kaleidoscope: 0,
  squeezeX: 0,
  squeezeY: 0,
  emboss: 0,
  linocut: 0,
  fog: 0,
  fogColor: '#c8d8e8',
  speedLines: 0,
};

export type EffectFamilyId = 'light' | 'signal' | 'texture' | 'warp' | 'tone' | 'print';

export const EFFECT_FAMILY_META: Record<EffectFamilyId, { label: string; goodFor: string }> = {
  light: { label: 'Light', goodFor: 'glow, atmosphere, stage energy' },
  signal: { label: 'Signal', goodFor: 'glitch, analog video, damaged media' },
  texture: { label: 'Texture', goodFor: 'grain, paper, tactile surface' },
  warp: { label: 'Warp', goodFor: 'motion, lenses, liquid distortion' },
  tone: { label: 'Tone', goodFor: 'color grading and palette shifts' },
  print: { label: 'Print', goodFor: 'poster, riso, screen-print finishes' },
};

const EFFECT_CONTROL_FAMILIES: Record<EffectFamilyId, string[]> = {
  light: ['rayInt', 'rays', 'bloom', 'filmBurn', 'neonGlow', 'fog', 'speedLines'],
  signal: ['glitch', 'rgbSplit', 'ca', 'interlace', 'dataMosh', 'vhsTracking'],
  texture: ['grain', 'scanlines', 'scanlineWidth', 'matte', 'dither', 'emboss', 'linocut'],
  warp: [
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
    'kaleidoscope',
    'squeezeX',
    'squeezeY',
  ],
  tone: [
    'tintOp',
    'hueShift',
    'vignette',
    'pixelate',
    'posterize',
    'sepia',
    'infrared',
    'solarize',
    'bleachBypass',
    'cyanotype',
    'splitToneAmt',
  ],
  print: [
    'duotone',
    'halftone',
    'risoShift',
    'risoAngle',
    'overprint',
    'blur',
    'threshold',
    'edgeDetect',
    'gradientOverlay',
  ],
};

export function getEffectFamilyMeta(key: string) {
  const family =
    Object.entries(EFFECT_CONTROL_FAMILIES).find(([, keys]) => keys.includes(key))?.[0] ?? EFFECT_META[key]?.family;
  if (!family) return null;
  return EFFECT_FAMILY_META[family as EffectFamilyId];
}

export const EFFECT_META: Record<string, EffectMeta> = {
  rayInt: {
    title: 'Ray Intensity',
    description: 'Brightness of the thick colored poster-burst beams from center.',
    valueLabel: 'intensity 80',
    family: 'light',
    cfgOverride: { rayInt: 80, rays: 12 },
  },
  rays: {
    title: 'Ray Count',
    description:
      'Number of thick colored light beams in the poster burst. Use the manual field to push beyond the slider.',
    valueLabel: '20 rays',
    cfgOverride: { rays: 20, rayInt: 70 },
  },
  bloom: {
    title: 'Bloom',
    description: 'Glow bleed from bright areas, like overexposed film.',
    valueLabel: 'bloom 80',
    cfgOverride: { bloom: 80, rayInt: 70 },
  },
  filmBurn: {
    title: 'Film Burn',
    description: 'Hot corner flare, like film left exposed to light.',
    valueLabel: 'burn 80',
    cfgOverride: { filmBurn: 80 },
  },
  neonGlow: {
    title: 'Neon Glow',
    description: 'Bright pixels bloom through a saturated glow color.',
    valueLabel: 'glow 80',
    goodFor: 'club flyers, bright logos, synthetic light blooms',
    cfgOverride: { neonGlow: 80, neonColor: '#ff00ff' },
  },
  fog: {
    title: 'Fog',
    description: 'Luminance-weighted haze that softens highlights and atmosphere.',
    valueLabel: 'fog 65',
    cfgOverride: { fog: 65, fogColor: '#c8d8e8' },
  },
  speedLines: {
    title: 'Speed Lines',
    description:
      'Thin white manga motion streaks from center. Use the manual field for denser bursts than the slider range.',
    valueLabel: 'density 90',
    cfgOverride: { speedLines: 90 },
  },
  glitch: {
    title: 'VHS Streaks',
    description: 'Horizontal color bars layered over the image in screen blend.',
    valueLabel: '14 streaks',
    cfgOverride: { glitch: 14 },
  },
  ca: {
    title: 'Radial Chromatic Aberration',
    description: 'Red and blue channel fringe that grows toward image edges.',
    valueLabel: 'fringe 18',
    cfgOverride: { ca: 18 },
  },
  interlace: {
    title: 'Interlace',
    description: 'Alternating scanline row shift, like a CRT signal dropout.',
    valueLabel: 'intensity 60',
    cfgOverride: { interlace: 60 },
  },
  dataMosh: {
    title: 'Data Mosh',
    description: 'Block displacement glitch, like a corrupted video frame.',
    valueLabel: 'intensity 70',
    goodFor: 'broken video, brutal posters, compressed screenshots',
    cfgOverride: { dataMosh: 70 },
  },
  vhsTracking: {
    title: 'VHS Tracking',
    description: 'Horizontal band desync and channel slip, like damaged tape tracking.',
    valueLabel: 'tracking 70',
    cfgOverride: { vhsTracking: 70 },
  },
  grain: {
    title: 'Film Grain',
    description: 'Noise layered at overlay blend mode, adds organic texture.',
    valueLabel: 'grain 50',
    cfgOverride: { grain: 50 },
  },
  scanlines: {
    title: 'Scanlines',
    description: 'Opacity of horizontal dark bands across the image, like a CRT monitor.',
    valueLabel: 'opacity 30',
    cfgOverride: { scanlines: 30, scanlineWidth: 1 },
  },
  scanlineWidth: {
    title: 'Scanline Width',
    description: 'Thickness of each horizontal scanline in base cover pixels.',
    valueLabel: 'width 3px',
    cfgOverride: { scanlines: 55, scanlineWidth: 3 },
  },
  matte: {
    title: 'Matte Texture',
    description: 'Low-resolution paper-like surface grain blended over the frame.',
    valueLabel: 'matte 70',
    cfgOverride: { matte: 70 },
  },
  dither: {
    title: 'Dither',
    description: 'Ordered Bayer dithering that visibly reduces tone steps.',
    valueLabel: 'dither 80',
    cfgOverride: { dither: 80 },
  },
  emboss: {
    title: 'Emboss',
    description: 'Diagonal relief shading that turns detail into raised surface.',
    valueLabel: 'emboss 75',
    cfgOverride: { emboss: 75 },
  },
  linocut: {
    title: 'Linocut',
    description: 'Dithered poster reduction for bold carved-print texture.',
    valueLabel: 'linocut 75',
    cfgOverride: { linocut: 75 },
  },
  tintOp: {
    title: 'Tint Opacity',
    description: 'Strength of the color tint multiply layer over the image.',
    valueLabel: 'opacity 60',
    cfgOverride: { tintOp: 60 },
  },
  noiseWarp: {
    title: 'Noise Warp',
    description: 'Smooth hash-based organic distortion across the full image.',
    valueLabel: 'intensity 70',
    cfgOverride: { noiseWarp: 70 },
  },
  morphAmt: {
    title: 'Liquid Morph',
    description: 'Wave-driven distortion: the image shimmers like heat haze.',
    valueLabel: 'intensity 60',
    cfgOverride: { morphAmt: 60, morphFreq: 6 },
  },
  morphFreq: {
    title: 'Morph Frequency',
    description: 'Wave frequency of the liquid morph. Higher means tighter ripples.',
    valueLabel: 'freq 14',
    cfgOverride: { morphAmt: 50, morphFreq: 14 },
  },
  vortex: {
    title: 'Vortex',
    description: 'Rotational twist from center outward: the image spirals inward.',
    valueLabel: 'intensity 70',
    cfgOverride: { vortex: 70 },
  },
  barrel: {
    title: 'Barrel Distortion',
    description: 'Lens distortion that bulges the image outward from center.',
    valueLabel: 'k 60',
    cfgOverride: { barrel: 60 },
  },
  tearAmt: {
    title: 'Chunk Tear',
    description: 'Horizontal strip displacement, like a VHS tape dropout.',
    valueLabel: 'intensity 10',
    cfgOverride: { tearAmt: 10, tearSize: 4 },
  },
  tearSize: {
    title: 'Tear Strip Height',
    description: 'Height of the displaced strips in the chunk tear effect.',
    valueLabel: 'size 8',
    cfgOverride: { tearAmt: 8, tearSize: 8 },
  },
  mirror: {
    title: 'Mirror',
    description: 'Fold symmetry: 1 horizontal, 2 vertical, 3 quad.',
    valueLabel: 'fold-x',
    cfgOverride: { mirror: 1 },
  },
  waveAmt: {
    title: 'Wave',
    description: 'Horizontal sine displacement scanned row by row.',
    valueLabel: 'wave 55',
    cfgOverride: { waveAmt: 55, waveFreq: 6 },
  },
  waveFreq: {
    title: 'Wave Frequency',
    description: 'Number of sine-wave bends across the frame height.',
    valueLabel: 'freq 12',
    cfgOverride: { waveAmt: 45, waveFreq: 12 },
  },
  zoomBlur: {
    title: 'Zoom Blur',
    description: 'Radial expansion blur from center, like fast lens push.',
    valueLabel: 'zoom 70',
    cfgOverride: { zoomBlur: 70 },
  },
  rippleAmt: {
    title: 'Ripple',
    description: 'Concentric radial wave distortion from the center.',
    valueLabel: 'ripple 60',
    cfgOverride: { rippleAmt: 60, rippleFreq: 6 },
  },
  rippleFreq: {
    title: 'Ripple Frequency',
    description: 'Density of rings in the radial ripple distortion.',
    valueLabel: 'freq 12',
    cfgOverride: { rippleAmt: 45, rippleFreq: 12 },
  },
  kaleidoscope: {
    title: 'Kaleidoscope',
    description: 'Mirror-folds the frame into radial repeating sectors.',
    valueLabel: 'fold 70',
    cfgOverride: { kaleidoscope: 70 },
  },
  squeezeX: {
    title: 'Squeeze X',
    description: 'Anamorphic horizontal stretch or compression around center.',
    valueLabel: 'x 50',
    cfgOverride: { squeezeX: 50 },
  },
  squeezeY: {
    title: 'Squeeze Y',
    description: 'Anamorphic vertical stretch or compression around center.',
    valueLabel: 'y -35',
    cfgOverride: { squeezeY: -35 },
  },
  hueShift: {
    title: 'Hue Shift',
    description: 'Rotates all colors around the hue wheel.',
    valueLabel: '120°',
    cfgOverride: { hueShift: 120 },
  },
  rgbSplit: {
    title: 'RGB Split',
    description: 'Diagonal RGB channel separation: a prism effect.',
    valueLabel: 'split 18',
    cfgOverride: { rgbSplit: 18 },
  },
  vignette: {
    title: 'Vignette',
    description: 'Darkens image edges toward the brand tone.',
    valueLabel: 'intensity 80',
    cfgOverride: { vignette: 80 },
  },
  pixelate: {
    title: 'Pixelate',
    description: 'Mosaic pixelation. Larger values produce bigger blocks.',
    valueLabel: 'block 8',
    goodFor: 'lo-fi exports, pixel art, intentional low-resolution moods',
    cfgOverride: { pixelate: 8 },
  },
  posterize: {
    title: 'Posterize',
    description: 'Reduces the color palette to hard stepped bands.',
    valueLabel: '6 steps',
    cfgOverride: { posterize: 6 },
  },
  sepia: {
    title: 'Sepia',
    description: 'Warm darkroom toning for aged photographic color.',
    valueLabel: 'sepia 75',
    cfgOverride: { sepia: 75 },
  },
  infrared: {
    title: 'Infrared',
    description: 'False-color infrared shift that pushes greens toward hot reds.',
    valueLabel: 'infrared 70',
    cfgOverride: { infrared: 70 },
  },
  solarize: {
    title: 'Solarize',
    description: 'Inverts bright luminance values for a Sabattier negative effect.',
    valueLabel: 'solarize 70',
    cfgOverride: { solarize: 70 },
  },
  bleachBypass: {
    title: 'Bleach Bypass',
    description: 'Crushed contrast and reduced saturation, like skipped film bleach.',
    valueLabel: 'bleach 80',
    cfgOverride: { bleachBypass: 80 },
  },
  cyanotype: {
    title: 'Cyanotype',
    description: 'Maps image tones toward Prussian blue and ivory paper.',
    valueLabel: 'cyan 80',
    cfgOverride: { cyanotype: 80 },
  },
  splitToneAmt: {
    title: 'Split Tone',
    description: 'Colors shadows and highlights with separate inks.',
    valueLabel: 'split 70',
    cfgOverride: { splitToneAmt: 70, splitShadow: '#001a4f', splitHighlight: '#ff8040' },
  },
  duotone: {
    title: 'Duotone',
    description: 'Maps dark and light tones to two ink colors, like risograph.',
    valueLabel: 'strength 80',
    cfgOverride: { duotone: 80 },
  },
  halftone: {
    title: 'Halftone',
    description: 'Replaces the image with a dot-screen grid, like offset print.',
    valueLabel: 'grid 15',
    cfgOverride: { halftone: 15 },
  },
  risoShift: {
    title: 'Misregistration',
    description: 'Print misregistration offset: a double-exposed riso print look.',
    valueLabel: 'shift 22',
    cfgOverride: { risoShift: 22, risoAngle: 30 },
  },
  risoAngle: {
    title: 'Misreg Angle',
    description: 'Direction of the misregistration shift in degrees.',
    valueLabel: 'angle 45°',
    cfgOverride: { risoShift: 18, risoAngle: 45 },
  },
  overprint: {
    title: 'Overprint',
    description: 'CMY print plates offset and multiplied over the frame.',
    valueLabel: 'overprint 65',
    cfgOverride: { overprint: 65 },
  },
  blur: {
    title: 'Blur',
    description: 'Softens the full frame before downstream effects.',
    valueLabel: 'blur 30',
    cfgOverride: { blurAmt: 30 },
  },
  threshold: {
    title: 'Threshold',
    description: 'Cuts luminance into stark black and white shapes.',
    valueLabel: 'cutoff 50',
    goodFor: 'xerox looks, harsh logos, high-contrast typography',
    cfgOverride: { threshold: 50 },
  },
  edgeDetect: {
    title: 'Edge Detect',
    description: 'Finds hard contours and turns image detail into linework.',
    valueLabel: 'edge 60',
    cfgOverride: { edgeDetect: 60 },
  },
  gradientOverlay: {
    title: 'Gradient Overlay',
    description: 'Blends a two-color ramp over the source.',
    valueLabel: 'mix 50',
    cfgOverride: { gradMix: 50, gradA: '#0a0020', gradB: '#ff6ec7' },
  },
};

const THUMB_SIZE = 200;
const thumbCache = new Map<string, string>();

export async function renderEffectThumb(key: string): Promise<string> {
  if (thumbCache.has(key)) return thumbCache.get(key)!;

  const meta = EFFECT_META[key];
  if (!meta) return '';

  const doc: CanvasDocument = {
    global: { bg: '#120020', seed: BASE_SEED, aspect: '1:1' },
    layers: [BASE_EMOJI_LAYER, ...splitEffectPatchIntoPresetLayers({ ...BASE_EFFECT, ...meta.cfgOverride })],
    export: { ...DEFAULT_EXPORT },
  };

  const canvas = await renderDocument(doc, THUMB_SIZE, THUMB_SIZE, new Map());
  const url = canvas.toDataURL('image/jpeg', 0.8);
  thumbCache.set(key, url);
  return url;
}
