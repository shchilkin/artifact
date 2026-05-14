import { describe, expect, it } from 'vitest';
import { EFFECT_PRESET_MENU_ORDER } from '../../types/config';
import {
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
