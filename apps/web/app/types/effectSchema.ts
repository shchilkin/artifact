/**
 * Effects: what the editor offers and what an effect layer's stack stores. Each effect owns its parameters (often
 * a `mode` that picks a variant) and turns them into calls of the render kernels in `effectKernels.ts`. An effect
 * also says how to reproduce each kernel it absorbs, so looks described in kernel parameters (presets, starters,
 * older documents) become effect parameters without changing a pixel.
 */
import type { EffectPreset } from './config';
import {
  type EffectFamilyId,
  KERNEL_IDS,
  KERNEL_PARAMS,
  type KernelId,
  type KernelParamKey,
  type KernelParamValues,
  kernelDefinition,
  kernelParamKeys,
  type ParamSpec,
} from './effectKernels';

export type EffectParamValue = number | string;
/** An effect's stored parameters, keyed by the effect's own parameter names. */
export type EffectParams = Record<string, EffectParamValue>;

/** An effect parameter. `when` shows it only while another parameter (usually `mode`) has one of the values. */
export type EffectParamSpec = ParamSpec & { when?: { param: string; values: readonly string[] } };

export interface KernelCall {
  kernel: KernelId;
  values: Partial<KernelParamValues>;
}

export interface EffectSpec {
  label: string;
  family?: EffectFamilyId;
  params: Readonly<Record<string, EffectParamSpec>>;
  /** The parameter the inspector summary reads. */
  amount: string;
  /** The kernel calls these parameters make, in order. Calls whose kernel is inactive are skipped by the renderer. */
  kernels(params: EffectParams): KernelCall[];
  /** For each kernel the effect absorbs: parameters whose `kernels` call reproduces that kernel's values exactly. */
  absorbs: Partial<Record<KernelId, (values: KernelParamValues) => EffectParams>>;
  /** The preset whose values "Add effect" starts from. */
  starter: EffectPreset;
}

function pick(source: Partial<Record<string, unknown>>, keys: readonly string[]): EffectParams {
  const picked: EffectParams = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' || typeof value === 'string') picked[key] = value;
  }
  return picked;
}

function stripKernel({ kernel, ...spec }: (typeof KERNEL_PARAMS)[KernelParamKey]): ParamSpec {
  void kernel;
  return spec;
}

/** An effect that is exactly one kernel: the kernel's parameters under their own names. */
function kernelEffect(kernel: KernelId, label: string): EffectSpec {
  const keys = kernelParamKeys(kernel);
  return {
    label,
    family: kernelDefinition(kernel).family,
    params: Object.fromEntries(keys.map((key) => [key, stripKernel(KERNEL_PARAMS[key])])),
    amount: kernelDefinition(kernel).amounts[0],
    kernels: (params) => [{ kernel, values: pick(params, keys) as Partial<KernelParamValues> }],
    absorbs: { [kernel]: (values: KernelParamValues) => pick(values, keys) },
    starter: kernel as EffectPreset,
  };
}

/** Every effect, in library order. */
export const EFFECTS = {
  rays: kernelEffect('rays', 'Rays'),
  bloom: kernelEffect('bloom', 'Bloom'),
  filmBurn: kernelEffect('filmBurn', 'Film Burn'),
  neonGlow: kernelEffect('neonGlow', 'Neon Glow'),
  fog: kernelEffect('fog', 'Fog'),
  speedLines: kernelEffect('speedLines', 'Speed Lines'),
  glitch: kernelEffect('glitch', 'Glitch'),
  rgbSplit: kernelEffect('rgbSplit', 'RGB Split'),
  ca: kernelEffect('ca', 'Chrom. Ab.'),
  interlace: kernelEffect('interlace', 'Interlace'),
  dataMosh: kernelEffect('dataMosh', 'Data Mosh'),
  vhsTracking: kernelEffect('vhsTracking', 'VHS Track'),
  badStream: kernelEffect('badStream', 'Bad Stream'),
  pixelStretch: kernelEffect('pixelStretch', 'Pixel Stretch'),
  grain: kernelEffect('grain', 'Grain'),
  dotGrain: kernelEffect('dotGrain', 'Dot Grain'),
  scanlines: kernelEffect('scanlines', 'Scanlines'),
  matte: kernelEffect('matte', 'Matte'),
  dither: kernelEffect('dither', 'Dither'),
  emboss: kernelEffect('emboss', 'Emboss'),
  linocut: kernelEffect('linocut', 'Linocut'),
  tint: kernelEffect('tint', 'Tint'),
  noiseWarp: kernelEffect('noiseWarp', 'Noise Warp'),
  morph: kernelEffect('morph', 'Morph'),
  vortex: kernelEffect('vortex', 'Vortex'),
  barrel: kernelEffect('barrel', 'Barrel'),
  tear: kernelEffect('tear', 'Tear'),
  mirror: kernelEffect('mirror', 'Mirror'),
  wave: kernelEffect('wave', 'Wave'),
  zoomBlur: kernelEffect('zoomBlur', 'Zoom Blur'),
  ripple: kernelEffect('ripple', 'Ripple'),
  patternRefraction: kernelEffect('patternRefraction', 'Pattern Refraction'),
  kaleidoscope: kernelEffect('kaleidoscope', 'Kaleidoscope'),
  squeeze: kernelEffect('squeeze', 'Squeeze'),
  hueShift: kernelEffect('hueShift', 'Hue Shift'),
  vignette: kernelEffect('vignette', 'Vignette'),
  retroResolution: kernelEffect('retroResolution', 'Retro Resolution'),
  pixelate: kernelEffect('pixelate', 'Pixelate'),
  posterize: kernelEffect('posterize', 'Posterize'),
  indexedPalette: kernelEffect('indexedPalette', 'Indexed Palette'),
  gradientMap: kernelEffect('gradientMap', 'Gradient Map'),
  channelMixer: kernelEffect('channelMixer', 'Channel Mixer'),
  sepia: kernelEffect('sepia', 'Sepia'),
  infrared: kernelEffect('infrared', 'Infrared'),
  solarize: kernelEffect('solarize', 'Solarize'),
  bleachBypass: kernelEffect('bleachBypass', 'Bleach Bypass'),
  cyanotype: kernelEffect('cyanotype', 'Cyanotype'),
  splitTone: kernelEffect('splitTone', 'Split Tone'),
  duotone: kernelEffect('duotone', 'Duotone'),
  halftone: kernelEffect('halftone', 'Halftone'),
  risoShift: kernelEffect('risoShift', 'Misregister'),
  overprint: kernelEffect('overprint', 'Overprint'),
  blur: kernelEffect('blur', 'Blur'),
  threshold: kernelEffect('threshold', 'Threshold'),
  edgeCrush: kernelEffect('edgeCrush', 'Alpha Crush'),
  silhouetteCrush: kernelEffect('silhouetteCrush', 'Silhouette Crush'),
  edgeDetect: kernelEffect('edgeDetect', 'Edge Detect'),
  bokehBlur: kernelEffect('bokehBlur', 'Bokeh Blur'),
  hatching: kernelEffect('hatching', 'Hatching'),
  gooeyMerge: kernelEffect('gooeyMerge', 'Gooey Merge'),
  gradientOverlay: kernelEffect('gradientOverlay', 'Gradient'),
} satisfies Record<string, EffectSpec>;

export type EffectId = keyof typeof EFFECTS;

const EFFECT_SPECS: Record<EffectId, EffectSpec> = EFFECTS;

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

export function isEffectId(value: string): value is EffectId {
  return value in EFFECTS;
}

export function effectSpec(effect: EffectId): EffectSpec {
  return EFFECT_SPECS[effect];
}

/** Default value of every parameter an effect owns. */
export function effectDefaults(effect: EffectId): EffectParams {
  return Object.fromEntries(Object.entries(EFFECT_SPECS[effect].params).map(([key, spec]) => [key, spec.default]));
}

/** Whether a parameter shows for these values: always, or while its `when` parameter has one of its values. */
export function isEffectParamShown(spec: EffectParamSpec, params: EffectParams): boolean {
  return !spec.when || spec.when.values.includes(String(params[spec.when.param]));
}

const KERNEL_OWNERS = new Map<KernelId, EffectId>(
  EFFECT_IDS.flatMap((effect) =>
    (Object.keys(EFFECT_SPECS[effect].absorbs) as KernelId[]).map((kernel) => [kernel, effect] as const),
  ),
);

/** The effect that absorbs a kernel. Every kernel has exactly one (`effectSchema.test.ts`). */
export function effectOfKernel(kernel: KernelId): EffectId {
  const effect = KERNEL_OWNERS.get(kernel);
  if (!effect) throw new Error(`Kernel ${kernel} belongs to no effect`);
  return effect;
}

/** The effect and parameters that reproduce one kernel's values, over the effect's defaults. */
export function effectFromKernel(
  kernel: KernelId,
  values: KernelParamValues,
): { effect: EffectId; params: EffectParams } {
  const effect = effectOfKernel(kernel);
  const absorb = EFFECT_SPECS[effect].absorbs[kernel];
  return { effect, params: { ...effectDefaults(effect), ...absorb?.(values) } };
}

/** Kernels in the order `KERNEL_IDS` lists them, for exhaustiveness checks. */
export const ABSORBED_KERNELS = KERNEL_IDS.filter((kernel) => KERNEL_OWNERS.has(kernel));
