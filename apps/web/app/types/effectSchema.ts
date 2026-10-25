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
  type NumberParamSpec,
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
  /** The kernel calls these parameters make, in order. Calls whose kernel is inactive are skipped by the renderer. */
  kernels(params: EffectParams): KernelCall[];
  /** For each kernel the effect absorbs: parameters whose `kernels` call reproduces that kernel's values exactly. */
  absorbs: Partial<Record<KernelId, (values: KernelParamValues) => EffectParams>>;
  /** The preset whose values "Add effect" starts from. */
  starter: EffectPreset;
  /** For a `mode` parameter: the preset a mode starts from when switching to it would leave the effect off. */
  modePresets?: Readonly<Record<string, EffectPreset>>;
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
    kernels: (params) => [{ kernel, values: pick(params, keys) as Partial<KernelParamValues> }],
    absorbs: { [kernel]: (values: KernelParamValues) => pick(values, keys) },
    starter: kernel as EffectPreset,
  };
}

function numParam(
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  options: Pick<NumberParamSpec, 'overrideMax' | 'format' | 'help'> & Pick<EffectParamSpec, 'when'> = {},
): EffectParamSpec {
  return { type: 'number', label, default: defaultValue, min, max, ...options };
}

function colorParam(label: string, defaultValue: string, when?: EffectParamSpec['when']): EffectParamSpec {
  return { type: 'color', label, default: defaultValue, ...(when ? { when } : {}) };
}

/** Shown only in these modes. */
function inModes(...values: string[]): EffectParamSpec['when'] {
  return { param: 'mode', values };
}

/** A kernel's own parameters, shown only in one mode of a modal effect. */
function kernelParamsInMode(kernel: KernelId, mode: string): Record<string, EffectParamSpec> {
  return Object.fromEntries(
    kernelParamKeys(kernel).map((key) => [key, { ...stripKernel(KERNEL_PARAMS[key]), when: inModes(mode) }]),
  );
}

interface EffectMode {
  value: string;
  label: string;
  kernel: KernelId;
  preset: EffectPreset;
  /** Effect parameters to the kernel's values. Defaults to the kernel's own parameters under their names. */
  toKernel?: (params: EffectParams) => Partial<KernelParamValues>;
  /** The kernel's values to effect parameters (without `mode`). Defaults to the kernel's own parameters. */
  fromKernel?: (values: KernelParamValues) => EffectParams;
}

/** An effect with a `mode` parameter; each mode runs one kernel. */
function modalEffect({
  label,
  family,
  modeLabel,
  modes,
  params,
}: {
  label: string;
  family: EffectFamilyId;
  modeLabel: string;
  modes: readonly EffectMode[];
  params: Record<string, EffectParamSpec>;
}): EffectSpec {
  const own = (kernel: KernelId) => kernelParamKeys(kernel);
  const modeOf = (params: EffectParams) => modes.find((mode) => mode.value === params.mode) ?? modes[0];
  return {
    label,
    family,
    params: {
      mode: {
        type: 'choice',
        label: modeLabel,
        default: modes[0].value,
        options: modes.map(({ value, label: optionLabel }) => ({ value, label: optionLabel })),
      },
      ...params,
    },
    kernels: (params) => {
      const mode = modeOf(params);
      const values = mode.toKernel?.(params) ?? (pick(params, own(mode.kernel)) as Partial<KernelParamValues>);
      return [{ kernel: mode.kernel, values }];
    },
    absorbs: Object.fromEntries(
      modes.map((mode) => [
        mode.kernel,
        (values: KernelParamValues) => ({
          mode: mode.value,
          ...(mode.fromKernel?.(values) ?? pick(values, own(mode.kernel))),
        }),
      ]),
    ),
    starter: modes[0].preset,
    modePresets: Object.fromEntries(modes.map((mode) => [mode.value, mode.preset])),
  };
}

function numberOf(value: EffectParamValue | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** A mode whose kernel reads one amount, shared by every mode of the effect as `amount`. */
function amountMode(value: string, label: string, kernel: KernelId, preset: EffectPreset): EffectMode {
  const [amountKey] = kernelDefinition(kernel).amounts as KernelParamKey[];
  return {
    value,
    label,
    kernel,
    preset,
    toKernel: (params) => ({ [amountKey]: numberOf(params.amount) }),
    fromKernel: (values) => ({ amount: values[amountKey] }),
  };
}

/** Every effect, in library order. */
export const EFFECTS = {
  rays: kernelEffect('rays', 'Rays'),
  bloom: kernelEffect('bloom', 'Bloom'),
  filmBurn: kernelEffect('filmBurn', 'Film Burn'),
  neonGlow: kernelEffect('neonGlow', 'Neon Glow'),
  colorOverlay: modalEffect({
    label: 'Color Overlay',
    family: 'tone',
    modeLabel: 'Style',
    params: {
      amount: numParam('Amount', 0, 0, 100, { format: 'percent' }),
      color: colorParam('Color', '#350055'),
      colorB: colorParam('End color', '#ff6ec7', inModes('gradient')),
      angle: numParam('Direction', 0, 0, 360, { format: 'deg', when: inModes('gradient') }),
    },
    modes: [
      {
        value: 'multiply',
        label: 'Tint',
        kernel: 'tint',
        preset: 'tint',
        toKernel: (params) => ({ tintOp: numberOf(params.amount), tint: String(params.color) }),
        fromKernel: (values) => ({ amount: values.tintOp, color: values.tint }),
      },
      {
        value: 'gradient',
        label: 'Gradient',
        kernel: 'gradientOverlay',
        preset: 'gradientOverlay',
        toKernel: (params) => ({
          gradMix: numberOf(params.amount),
          gradA: String(params.color),
          gradB: String(params.colorB),
          gradAngle: numberOf(params.angle),
        }),
        fromKernel: (values) => ({
          amount: values.gradMix,
          color: values.gradA,
          colorB: values.gradB,
          angle: values.gradAngle,
        }),
      },
      {
        value: 'haze',
        label: 'Haze',
        kernel: 'fog',
        preset: 'fog',
        toKernel: (params) => ({ fog: numberOf(params.amount), fogColor: String(params.color) }),
        fromKernel: (values) => ({ amount: values.fog, color: values.fogColor }),
      },
    ],
  }),
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
  posterize: modalEffect({
    label: 'Posterize',
    family: 'tone',
    modeLabel: 'Style',
    params: {
      ...kernelParamsInMode('posterize', 'levels'),
      ...kernelParamsInMode('dither', 'dither'),
      ...kernelParamsInMode('linocut', 'linocut'),
      ...kernelParamsInMode('threshold', 'threshold'),
      ...kernelParamsInMode('indexedPalette', 'palette'),
    },
    modes: [
      { value: 'levels', label: 'Levels', kernel: 'posterize', preset: 'posterize' },
      { value: 'dither', label: 'Dither', kernel: 'dither', preset: 'dither' },
      { value: 'linocut', label: 'Linocut', kernel: 'linocut', preset: 'linocut' },
      { value: 'threshold', label: 'Threshold', kernel: 'threshold', preset: 'threshold' },
      { value: 'palette', label: 'Palette', kernel: 'indexedPalette', preset: 'indexedPalette' },
    ],
  }),
  emboss: kernelEffect('emboss', 'Emboss'),
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
  gradientMap: modalEffect({
    label: 'Gradient Map',
    family: 'tone',
    modeLabel: 'Stops',
    params: {
      amount: numParam('Amount', 0, 0, 100, { format: 'percent' }),
      shadow: colorParam('Shadow', '#0a0020'),
      mid: colorParam('Midtone', '#9c5a13', inModes('tri')),
      highlight: colorParam('Highlight', '#ff6ec7'),
    },
    modes: [
      {
        value: 'duo',
        label: 'Two colors',
        kernel: 'duotone',
        preset: 'duotone',
        toKernel: (params) => ({
          duotone: numberOf(params.amount),
          duoA: String(params.shadow),
          duoB: String(params.highlight),
        }),
        fromKernel: (values) => ({ amount: values.duotone, shadow: values.duoA, highlight: values.duoB }),
      },
      {
        value: 'tri',
        label: 'Three colors',
        kernel: 'gradientMap',
        preset: 'gradientMap',
        toKernel: (params) => ({
          gradientMap: numberOf(params.amount),
          gradientMapShadow: String(params.shadow),
          gradientMapMid: String(params.mid),
          gradientMapHighlight: String(params.highlight),
        }),
        fromKernel: (values) => ({
          amount: values.gradientMap,
          shadow: values.gradientMapShadow,
          mid: values.gradientMapMid,
          highlight: values.gradientMapHighlight,
        }),
      },
      {
        value: 'split',
        label: 'Split tone',
        kernel: 'splitTone',
        preset: 'splitTone',
        toKernel: (params) => ({
          splitToneAmt: numberOf(params.amount),
          splitShadow: String(params.shadow),
          splitHighlight: String(params.highlight),
        }),
        fromKernel: (values) => ({
          amount: values.splitToneAmt,
          shadow: values.splitShadow,
          highlight: values.splitHighlight,
        }),
      },
    ],
  }),
  colorFilter: modalEffect({
    label: 'Color Filter',
    family: 'tone',
    modeLabel: 'Look',
    params: {
      amount: numParam('Amount', 0, 0, 100, { format: 'percent' }),
      ...kernelParamsInMode('channelMixer', 'mixer'),
    },
    modes: [
      amountMode('sepia', 'Sepia', 'sepia', 'sepia'),
      amountMode('infrared', 'Infrared', 'infrared', 'infrared'),
      amountMode('bleach', 'Bleach bypass', 'bleachBypass', 'bleachBypass'),
      amountMode('solarize', 'Solarize', 'solarize', 'solarize'),
      amountMode('cyanotype', 'Cyanotype', 'cyanotype', 'cyanotype'),
      {
        ...amountMode('mixer', 'Channel mixer', 'channelMixer', 'channelMixer'),
        toKernel: (params) => ({
          channelMixer: numberOf(params.amount),
          channelRedMix: numberOf(params.channelRedMix),
          channelGreenMix: numberOf(params.channelGreenMix),
          channelBlueMix: numberOf(params.channelBlueMix),
        }),
        fromKernel: (values) => ({
          amount: values.channelMixer,
          channelRedMix: values.channelRedMix,
          channelGreenMix: values.channelGreenMix,
          channelBlueMix: values.channelBlueMix,
        }),
      },
    ],
  }),
  halftone: kernelEffect('halftone', 'Halftone'),
  risoShift: kernelEffect('risoShift', 'Misregister'),
  overprint: kernelEffect('overprint', 'Overprint'),
  blur: kernelEffect('blur', 'Blur'),
  edgeCrush: kernelEffect('edgeCrush', 'Alpha Crush'),
  silhouetteCrush: kernelEffect('silhouetteCrush', 'Silhouette Crush'),
  edgeDetect: kernelEffect('edgeDetect', 'Edge Detect'),
  bokehBlur: kernelEffect('bokehBlur', 'Bokeh Blur'),
  hatching: kernelEffect('hatching', 'Hatching'),
  gooeyMerge: kernelEffect('gooeyMerge', 'Gooey Merge'),
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
