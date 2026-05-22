import { describe, expect, it } from 'vitest';
import { EFFECT_PRESET_MENU_ORDER } from '../../types/config';
import { ARRAY_PRESET_IDS } from '../../utils/arrayPresets';
import { NOISE_PRESET_IDS } from '../../utils/noisePresets';
import { REPEAT_PRESET_IDS } from '../../utils/repeatPresets';
import {
  ADD_NODE_ITEMS,
  COLOR_PRESETS,
  GLITCH_PRESETS,
  GRAPHIC_PRESETS,
  RAYS_PRESETS,
  RISO_PRESETS,
  TEXTURE_PRESETS,
  TINT_PRESETS,
  WARP_PRESETS,
} from './constants';

describe('node effect preset groups', () => {
  it('keeps every add-menu effect preset configurable in the inspector', () => {
    const configurablePresets = new Set([
      ...RAYS_PRESETS,
      ...GLITCH_PRESETS,
      ...TEXTURE_PRESETS,
      ...TINT_PRESETS,
      ...WARP_PRESETS,
      ...COLOR_PRESETS,
      ...RISO_PRESETS,
      ...GRAPHIC_PRESETS,
    ]);

    expect([...EFFECT_PRESET_MENU_ORDER].filter((preset) => !configurablePresets.has(preset))).toEqual([]);
  });
});

describe('node source preset menu', () => {
  it('exposes procedural source and repeater presets in the add menu', () => {
    const presetActions = ADD_NODE_ITEMS.map((item) => item.action);

    for (const preset of NOISE_PRESET_IDS) {
      expect(presetActions).toContainEqual({ kind: 'noisePreset', preset });
    }
    for (const preset of ARRAY_PRESET_IDS) {
      expect(presetActions).toContainEqual({ kind: 'arrayPreset', preset });
    }
    for (const preset of REPEAT_PRESET_IDS) {
      expect(presetActions).toContainEqual({ kind: 'repeatPreset', preset });
    }
  });

  it('exposes the graph repeater utility node', () => {
    expect(ADD_NODE_ITEMS.map((item) => item.action)).toContainEqual({ kind: 'repeat' });
  });

  it('exposes an AI image source node', () => {
    expect(ADD_NODE_ITEMS).toContainEqual(
      expect.objectContaining({
        label: 'AI Image',
        group: 'generators',
        action: { kind: 'aiImage' },
      }),
    );
  });
});
