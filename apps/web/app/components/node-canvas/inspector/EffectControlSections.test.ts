import { describe, expect, it } from 'vitest';

import {
  KERNEL_PARAM_KEYS,
  type KernelId,
  type KernelParamKey,
  kernelParam,
  type NumberParamSpec,
} from '../../../types/effectKernels';
import { EFFECT_IDS, effectSpec } from '../../../types/effectSchema';
import { EFFECT_META } from '../../../utils/effectInfo';
import {
  activeIndexedPaletteCount,
  effectSliderUnit,
  formatEffectSliderValue,
  randomIndexedPalettePatch,
} from './EffectControlSections';

type SliderMetadata = Omit<NumberParamSpec, 'format'> & {
  field: KernelParamKey;
  kernel: KernelId;
  valueFormat?: NumberParamSpec['format'];
};

function sliderOf(field: KernelParamKey): SliderMetadata | null {
  const param = kernelParam(field);
  if (param.type !== 'number') return null;
  const { format, ...rest } = param;
  return { ...rest, field, valueFormat: format };
}

function findSlider(field: KernelParamKey): SliderMetadata {
  const control = sliderOf(field);
  if (!control) throw new Error(`Missing slider metadata for ${field}`);
  return control;
}

describe('EffectControlSections metadata', () => {
  it('formats slider values with useful creative units', () => {
    expect(formatEffectSliderValue(28, 'percent')).toBe('28%');
    expect(formatEffectSliderValue(6, 'px')).toBe('6px');
    expect(formatEffectSliderValue(120, 'deg')).toBe('120deg');
    expect(formatEffectSliderValue(6, 'bands')).toBe('6 bands');
    expect(formatEffectSliderValue(6, 'steps')).toBe('6 steps');
    expect(formatEffectSliderValue(1.5, 'px')).toBe('1.5px');
  });

  it('shows short units after numeric entry and leaves counted formats to the read-out', () => {
    expect(effectSliderUnit('percent')).toBe('%');
    expect(effectSliderUnit('px')).toBe('px');
    expect(effectSliderUnit('deg')).toBe('°');
    expect(effectSliderUnit('bands')).toBeUndefined();
    expect(effectSliderUnit('steps')).toBeUndefined();
    expect(effectSliderUnit()).toBeUndefined();
  });

  it('gives every effect at least one control', () => {
    for (const effect of EFFECT_IDS) expect(Object.keys(effectSpec(effect).params).length, effect).toBeGreaterThan(0);
  });

  it('uses focused creative ranges for texture, pixel, and print controls', () => {
    expect(findSlider('grain')).toMatchObject({
      label: 'Grain',
      max: 50,
      overrideMax: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('dotGrain')).toMatchObject({
      label: 'Dot Grain',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('dotGrainSize')).toMatchObject({
      label: 'Dot Size',
      max: 9,
      overrideMax: 18,
      valueFormat: 'px',
    });
    expect(findSlider('dither')).toMatchObject({
      label: 'Dither',
      max: 70,
      overrideMax: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('pixelate')).toMatchObject({
      label: 'Block Size',
      max: 20,
      overrideMax: 80,
      valueFormat: 'px',
    });
    expect(findSlider('retroResolution')).toMatchObject({
      label: 'Longest Edge',
      min: 8,
      max: 512,
      overrideMax: 1024,
      valueFormat: 'px',
    });
    expect(findSlider('badStream')).toMatchObject({
      label: 'Compression',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('badStreamBlockSize')).toMatchObject({
      label: 'Macroblocks',
      min: 12,
      max: 96,
      overrideMax: 180,
      valueFormat: 'px',
    });
    expect(findSlider('badStreamDetail').kernel).toBe('badStream');
    expect(findSlider('badStreamSmear').kernel).toBe('badStream');
    expect(findSlider('badStreamChroma').kernel).toBe('badStream');
    expect(findSlider('badStreamDarkness').kernel).toBe('badStream');
    expect(findSlider('pixelStretch')).toMatchObject({
      label: 'Stretch',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('pixelStretchLength')).toMatchObject({
      label: 'Length',
      overrideMax: 160,
      valueFormat: 'px',
    });
    expect(findSlider('indexedPalette')).toMatchObject({
      label: 'Palette Mix',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('gradientMap')).toMatchObject({
      label: 'Map Mix',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('channelMixer')).toMatchObject({
      label: 'Mixer',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('patternRefraction')).toMatchObject({
      label: 'Refraction',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('patternRefractionScale')).toMatchObject({
      label: 'Pattern Scale',
      overrideMax: 160,
      valueFormat: 'px',
    });
    expect(findSlider('edgeCrush')).toMatchObject({
      label: 'Alpha Crush',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('bokehBlur')).toMatchObject({
      label: 'Bokeh Blur',
      max: 28,
      overrideMax: 60,
      valueFormat: 'px',
    });
    expect(findSlider('hatching')).toMatchObject({
      label: 'Hatching',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('gooeyMerge')).toMatchObject({
      label: 'Merge',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('gooeyRadius')).toMatchObject({
      label: 'Radius',
      overrideMax: 80,
      valueFormat: 'px',
    });
    expect(findSlider('silhouetteCrush')).toMatchObject({
      label: 'Silhouette Crush',
      max: 100,
      valueFormat: 'percent',
    });
    expect(findSlider('risoShift')).toMatchObject({
      label: 'Misreg Shift',
      max: 24,
      overrideMax: 60,
      valueFormat: 'px',
    });
  });

  it('clamps the active indexed palette swatch count to the renderer range', () => {
    expect(activeIndexedPaletteCount({ indexedPaletteCount: 1 })).toBe(2);
    expect(activeIndexedPaletteCount({ indexedPaletteCount: 4.4 })).toBe(4);
    expect(activeIndexedPaletteCount({ indexedPaletteCount: 9 })).toBe(6);
  });

  it('randomizes all editable indexed palette swatches without changing mix or count', () => {
    const patch = randomIndexedPalettePatch(() => 0);
    expect(Object.keys(patch).sort()).toEqual([
      'indexedColorA',
      'indexedColorB',
      'indexedColorC',
      'indexedColorD',
      'indexedColorE',
      'indexedColorF',
    ]);
    expect(patch.indexedColorA).toBe('#09001f');
    expect(patch.indexedPalette).toBeUndefined();
    expect(patch.indexedPaletteCount).toBeUndefined();
  });
});

describe('effect help limits', () => {
  const sliders = KERNEL_PARAM_KEYS.flatMap((field) => sliderOf(field) ?? []);
  const helpFor = (control: SliderMetadata) => EFFECT_META[control.help ?? control.field]?.description ?? '';

  it('promises typing past the slider only for controls whose entry accepts it, naming the control and its limits', () => {
    for (const control of sliders) {
      const description = helpFor(control);
      if (!/\btyp(e|ing)\b|\bbeyond\b|\bpast\b|\bmanual\b|\bslider\b|\brange\b/i.test(description)) continue;
      expect(description.toLowerCase(), `${control.field} help must name its control`).toContain(
        control.label.toLowerCase(),
      );
      const promise = description.match(/up to (\d+).*slider stops at (\d+)/);
      expect(promise, `${control.field}: ${description}`).not.toBeNull();
      expect(control.overrideMax, control.field).toBe(Number(promise?.[1]));
      expect(control.max, control.field).toBe(Number(promise?.[2]));
    }
  });
});
