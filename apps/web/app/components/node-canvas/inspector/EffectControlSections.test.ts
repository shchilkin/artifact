import { describe, expect, it } from 'vitest';

import { EFFECT_PRESET_MENU_ORDER } from '../../../types/config';
import { EFFECT_SECTION_DEFINITIONS, type EffectSliderControl, formatEffectSliderValue } from './EffectControlSections';

function findSlider(field: EffectSliderControl['field']): EffectSliderControl {
  const control = EFFECT_SECTION_DEFINITIONS.flatMap((section) => section.controls).find(
    (item): item is EffectSliderControl => item.type === 'slider' && item.field === field,
  );
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

  it('keeps every effect preset represented by the shared inspector metadata', () => {
    const represented = new Set(
      EFFECT_SECTION_DEFINITIONS.flatMap((section) => section.controls.flatMap((control) => control.presets)),
    );

    for (const preset of EFFECT_PRESET_MENU_ORDER) {
      expect(represented.has(preset)).toBe(true);
    }
  });

  it('uses focused creative ranges for texture, pixel, and print controls', () => {
    expect(findSlider('grain')).toMatchObject({
      label: 'Grain',
      max: 50,
      overrideMax: 100,
      valueFormat: 'percent',
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
    expect(findSlider('risoShift')).toMatchObject({
      label: 'Misreg Shift',
      max: 24,
      overrideMax: 60,
      valueFormat: 'px',
    });
  });
});
