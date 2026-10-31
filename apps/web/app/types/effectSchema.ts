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

/**
 * An effect parameter. `when` shows it only while another parameter (usually `mode`) has one of the values; `hidden`
 * keeps it out of the inspector (a value carried over from older documents).
 */
export type EffectParamSpec = ParamSpec & { when?: { param: string; values: readonly string[] }; hidden?: true };

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

function choiceParam(
  label: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  when?: EffectParamSpec['when'],
): EffectParamSpec {
  return { type: 'choice', label, default: options[0].value, options, ...(when ? { when } : {}) };
}

function colorParam(label: string, defaultValue: string, when?: EffectParamSpec['when']): EffectParamSpec {
  return { type: 'color', label, default: defaultValue, ...(when ? { when } : {}) };
}

/** Shown only in these modes. */
function inModes(...values: string[]): EffectParamSpec['when'] {
  return { param: 'mode', values };
}

/** A kernel's own parameters, shown only in one mode of a modal effect; `except` leaves out shared ones. */
function kernelParamsInMode(
  kernel: KernelId,
  mode: string,
  except: readonly KernelParamKey[] = [],
): Record<string, EffectParamSpec> {
  return Object.fromEntries(
    kernelParamKeys(kernel)
      .filter((key) => !except.includes(key))
      .map((key) => [key, { ...stripKernel(KERNEL_PARAMS[key]), when: inModes(mode) }]),
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
  adjust: {
    label: 'Adjust',
    family: 'tone',
    params: {
      brightness: numParam('Brightness', 0, -100, 100, { format: 'percent' }),
      contrast: numParam('Contrast', 0, -100, 100, { format: 'percent' }),
      saturation: numParam('Saturation', 0, -100, 100, { format: 'percent' }),
      temperature: numParam('Temperature', 0, -100, 100),
      hue: numParam('Hue', 0, 0, 360, { format: 'deg', help: 'hueShift' }),
      invert: numParam('Invert', 0, 0, 100, { format: 'percent' }),
    },
    kernels: (params) => [
      {
        kernel: 'adjust',
        values: {
          adjustBrightness: numberOf(params.brightness),
          adjustContrast: numberOf(params.contrast),
          adjustSaturation: numberOf(params.saturation),
          adjustTemperature: numberOf(params.temperature),
          adjustInvert: numberOf(params.invert),
        },
      },
      { kernel: 'hueShift', values: { hueShift: numberOf(params.hue) } },
    ],
    absorbs: {
      adjust: (values) => ({
        brightness: values.adjustBrightness,
        contrast: values.adjustContrast,
        saturation: values.adjustSaturation,
        temperature: values.adjustTemperature,
        invert: values.adjustInvert,
      }),
      hueShift: (values) => ({ hue: values.hueShift }),
    },
    starter: 'adjust',
  },
  colorFilter: modalEffect({
    label: 'Color Filter',
    family: 'tone',
    modeLabel: 'Look',
    params: {
      amount: numParam('Amount', 0, 0, 100, { format: 'percent' }),
      ...kernelParamsInMode('channelMixer', 'mixer', ['channelMixer']),
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
  pixelate: modalEffect({
    label: 'Pixelate',
    family: 'tone',
    modeLabel: 'Style',
    params: { ...kernelParamsInMode('pixelate', 'blocks'), ...kernelParamsInMode('retroResolution', 'retro') },
    modes: [
      { value: 'blocks', label: 'Blocks', kernel: 'pixelate', preset: 'pixelate' },
      { value: 'retro', label: 'Retro resolution', kernel: 'retroResolution', preset: 'retroResolution' },
    ],
  }),
  vignette: kernelEffect('vignette', 'Vignette'),
  glow: modalEffect({
    label: 'Glow',
    family: 'light',
    modeLabel: 'Style',
    params: {
      amount: numParam('Amount', 0, 0, 100, { format: 'percent' }),
      color: colorParam('Glow color', '#ff00ff', inModes('neon')),
    },
    modes: [
      amountMode('bloom', 'Bloom', 'bloom', 'bloom'),
      {
        ...amountMode('neon', 'Neon', 'neonGlow', 'neonGlow'),
        toKernel: (params) => ({ neonGlow: numberOf(params.amount), neonColor: String(params.color) }),
        fromKernel: (values) => ({ amount: values.neonGlow, color: values.neonColor }),
      },
    ],
  }),
  rays: modalEffect({
    label: 'Rays',
    family: 'light',
    modeLabel: 'Style',
    params: { ...kernelParamsInMode('rays', 'beams'), ...kernelParamsInMode('speedLines', 'lines') },
    modes: [
      { value: 'beams', label: 'Beams', kernel: 'rays', preset: 'rays' },
      { value: 'lines', label: 'Speed lines', kernel: 'speedLines', preset: 'speedLines' },
    ],
  }),
  filmBurn: kernelEffect('filmBurn', 'Film Burn'),
  grain: modalEffect({
    label: 'Grain',
    family: 'texture',
    modeLabel: 'Size',
    params: { amount: numParam('Amount', 0, 0, 100, { format: 'percent' }) },
    modes: [amountMode('fine', 'Fine', 'grain', 'grain'), amountMode('coarse', 'Coarse', 'matte', 'matte')],
  }),
  halftone: modalEffect({
    label: 'Halftone',
    family: 'print',
    modeLabel: 'Screen',
    params: {
      ...kernelParamsInMode('halftone', 'dots'),
      ...kernelParamsInMode('hatching', 'lines'),
      ...kernelParamsInMode('dotGrain', 'stochastic'),
    },
    modes: [
      { value: 'dots', label: 'Dots', kernel: 'halftone', preset: 'halftone' },
      { value: 'lines', label: 'Lines', kernel: 'hatching', preset: 'hatching' },
      { value: 'stochastic', label: 'Stipple', kernel: 'dotGrain', preset: 'dotGrain' },
    ],
  }),
  scanlines: kernelEffect('scanlines', 'Scanlines'),
  edges: modalEffect({
    label: 'Edges',
    family: 'texture',
    modeLabel: 'Style',
    params: { amount: numParam('Amount', 0, 0, 100, { format: 'percent' }) },
    modes: [
      amountMode('emboss', 'Emboss', 'emboss', 'emboss'),
      amountMode('outline', 'Outline', 'edgeDetect', 'edgeDetect'),
    ],
  }),
  risoShift: kernelEffect('risoShift', 'Misregister'),
  overprint: kernelEffect('overprint', 'Overprint'),
  channelSplit: modalEffect({
    label: 'Channel Split',
    family: 'signal',
    modeLabel: 'Direction',
    params: { amount: numParam('Distance', 0, 0, 40, { format: 'px' }) },
    modes: [amountMode('linear', 'Diagonal', 'rgbSplit', 'rgbSplit'), amountMode('radial', 'Radial', 'ca', 'ca')],
  }),
  lineGlitch: modalEffect({
    label: 'Line Glitch',
    family: 'signal',
    modeLabel: 'Style',
    params: {
      ...kernelParamsInMode('glitch', 'streaks'),
      ...kernelParamsInMode('tear', 'tear'),
      ...kernelParamsInMode('interlace', 'interlace'),
      ...kernelParamsInMode('vhsTracking', 'tracking'),
    },
    modes: [
      { value: 'streaks', label: 'Streaks', kernel: 'glitch', preset: 'glitch' },
      { value: 'tear', label: 'Tear', kernel: 'tear', preset: 'tear' },
      { value: 'interlace', label: 'Interlace', kernel: 'interlace', preset: 'interlace' },
      { value: 'tracking', label: 'VHS tracking', kernel: 'vhsTracking', preset: 'vhsTracking' },
    ],
  }),
  compression: modalEffect({
    label: 'Compression',
    family: 'signal',
    modeLabel: 'Style',
    params: { ...kernelParamsInMode('badStream', 'codec'), ...kernelParamsInMode('dataMosh', 'blocks') },
    modes: [
      { value: 'codec', label: 'Bad stream', kernel: 'badStream', preset: 'badStream' },
      { value: 'blocks', label: 'Data mosh', kernel: 'dataMosh', preset: 'dataMosh' },
    ],
  }),
  displace: modalEffect({
    label: 'Displace',
    family: 'warp',
    modeLabel: 'Field',
    params: {
      ...kernelParamsInMode('noiseWarp', 'noise'),
      ...kernelParamsInMode('morph', 'liquid'),
      ...kernelParamsInMode('wave', 'wave'),
      ...kernelParamsInMode('ripple', 'ripple'),
      ...kernelParamsInMode('patternRefraction', 'pattern'),
    },
    modes: [
      { value: 'noise', label: 'Noise', kernel: 'noiseWarp', preset: 'noiseWarp' },
      { value: 'liquid', label: 'Liquid', kernel: 'morph', preset: 'morph' },
      { value: 'wave', label: 'Wave', kernel: 'wave', preset: 'wave' },
      { value: 'ripple', label: 'Ripple', kernel: 'ripple', preset: 'ripple' },
      { value: 'pattern', label: 'Pattern refraction', kernel: 'patternRefraction', preset: 'patternRefraction' },
    ],
  }),
  lens: modalEffect({
    label: 'Lens',
    family: 'warp',
    modeLabel: 'Shape',
    params: {
      ...kernelParamsInMode('barrel', 'barrel'),
      ...kernelParamsInMode('vortex', 'swirl'),
      ...kernelParamsInMode('squeeze', 'squeeze'),
    },
    modes: [
      { value: 'barrel', label: 'Barrel', kernel: 'barrel', preset: 'barrel' },
      { value: 'swirl', label: 'Swirl', kernel: 'vortex', preset: 'vortex' },
      { value: 'squeeze', label: 'Squeeze', kernel: 'squeeze', preset: 'squeeze' },
    ],
  }),
  symmetry: modalEffect({
    label: 'Symmetry',
    family: 'warp',
    modeLabel: 'Fold',
    params: { ...kernelParamsInMode('mirror', 'mirror'), ...kernelParamsInMode('kaleidoscope', 'kaleidoscope') },
    modes: [
      { value: 'mirror', label: 'Mirror', kernel: 'mirror', preset: 'mirror' },
      { value: 'kaleidoscope', label: 'Kaleidoscope', kernel: 'kaleidoscope', preset: 'kaleidoscope' },
    ],
  }),
  blur: modalEffect({
    label: 'Blur',
    family: 'print',
    modeLabel: 'Type',
    params: {
      ...kernelParamsInMode('blur', 'gaussian'),
      ...kernelParamsInMode('bokehBlur', 'lens'),
      ...kernelParamsInMode('zoomBlur', 'zoom'),
      ...kernelParamsInMode('pixelStretch', 'motion'),
    },
    modes: [
      { value: 'gaussian', label: 'Soft', kernel: 'blur', preset: 'blur' },
      { value: 'lens', label: 'Lens', kernel: 'bokehBlur', preset: 'bokehBlur' },
      { value: 'zoom', label: 'Zoom', kernel: 'zoomBlur', preset: 'zoomBlur' },
      { value: 'motion', label: 'Motion', kernel: 'pixelStretch', preset: 'pixelStretch' },
    ],
  }),
  sharpen: kernelEffect('sharpen', 'Sharpen'),
  alphaCrush: modalEffect({
    label: 'Alpha Crush',
    family: 'print',
    modeLabel: 'Edge',
    params: { amount: numParam('Amount', 0, 0, 100, { format: 'percent' }) },
    modes: [
      amountMode('harden', 'Harden', 'edgeCrush', 'edgeCrush'),
      amountMode('chip', 'Chip', 'silhouetteCrush', 'silhouetteCrush'),
    ],
  }),
  gooeyMerge: kernelEffect('gooeyMerge', 'Gooey Merge'),
  shadow: {
    label: 'Shadow',
    family: 'light',
    params: {
      mode: choiceParam('Style', [
        { value: 'drop', label: 'Drop' },
        { value: 'grime', label: 'Grime' },
      ]),
      opacity: numParam('Opacity', 0, 0, 100, { format: 'percent' }),
      color: colorParam('Color', '#090606'),
      x: numParam('Offset X', 8, -100, 100, { format: 'px' }),
      y: numParam('Offset Y', 10, -100, 100, { format: 'px' }),
      blur: numParam('Blur', 10, 0, 60, { format: 'px' }),
      spread: numParam('Spread', 14, 0, 60, { format: 'px' }),
      layers: numParam('Layers', 5, 1, 12, { when: inModes('grime') }),
      grime: numParam('Grime', 45, 0, 100, { format: 'percent', when: inModes('grime') }),
      jitter: numParam('Jitter', 10, 0, 60, { format: 'px', when: inModes('grime') }),
      falloff: choiceParam(
        'Falloff',
        [
          { value: 'stack', label: 'Fade outer layers' },
          { value: 'flat', label: 'Flat' },
        ],
        inModes('grime'),
      ),
      source: choiceParam('Source', [
        { value: 'show', label: 'Keep source' },
        { value: 'hide', label: 'Shadow only' },
      ]),
      variation: { ...numParam('Variation', 0, 0, 4294967295), hidden: true },
    },
    kernels: (params) => {
      const drop = params.mode === 'drop';
      return [
        {
          kernel: 'shadow',
          values: {
            shadowOpacity: numberOf(params.opacity),
            shadowColor: String(params.color),
            shadowX: numberOf(params.x),
            shadowY: numberOf(params.y),
            shadowBlur: numberOf(params.blur),
            shadowSpread: numberOf(params.spread),
            shadowLayers: drop ? 1 : numberOf(params.layers),
            shadowGrime: drop ? 0 : numberOf(params.grime),
            shadowJitter: drop ? 0 : numberOf(params.jitter),
            shadowSource: String(params.source),
            shadowFalloff: drop ? 'flat' : String(params.falloff),
            shadowVariation: numberOf(params.variation),
          },
        },
      ];
    },
    absorbs: {
      shadow: (values) => ({
        mode:
          values.shadowFalloff === 'flat' &&
          values.shadowLayers === 1 &&
          values.shadowGrime === 0 &&
          values.shadowJitter === 0
            ? 'drop'
            : 'grime',
        opacity: values.shadowOpacity,
        color: values.shadowColor,
        x: values.shadowX,
        y: values.shadowY,
        blur: values.shadowBlur,
        spread: values.shadowSpread,
        layers: values.shadowLayers,
        grime: values.shadowGrime,
        jitter: values.shadowJitter,
        falloff: values.shadowFalloff,
        source: values.shadowSource,
        variation: values.shadowVariation,
      }),
    },
    starter: 'shadow',
    modePresets: { drop: 'shadow', grime: 'grimeShadow' },
  },
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
