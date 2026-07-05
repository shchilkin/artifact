import { describe, expect, it } from 'vitest';

import { EFFECT_PRESET_MENU_ORDER } from '../../../types/config';
import {
  activeIndexedPaletteCount,
  EFFECT_SECTION_DEFINITIONS,
  type EffectSliderControl,
  formatEffectSliderValue,
  randomIndexedPalettePatch,
} from './EffectControlSections';

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
    expect(findSlider('badStreamDetail').presets).toEqual(
      expect.arrayContaining(['badStream', 'detailBlocks', 'chromaBlocks']),
    );
    expect(findSlider('badStreamSmear').presets).toEqual(expect.arrayContaining(['badStream', 'blockSmear']));
    expect(findSlider('badStreamChroma').presets).toEqual(expect.arrayContaining(['badStream', 'chromaBlocks']));
    expect(findSlider('badStreamDarkness').presets).toEqual(expect.arrayContaining(['badStream', 'blockDropout']));
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
