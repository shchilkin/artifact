import { describe, expect, it } from 'vitest';

import { EFFECT_PRESET_MENU_ORDER } from '../types/config';
import { EFFECT_META, resolveEffectThumbKey } from './effectInfo';

describe('effect info thumbnails', () => {
  it('maps every effect preset to thumbnail metadata', () => {
    for (const preset of EFFECT_PRESET_MENU_ORDER) {
      expect(EFFECT_META[resolveEffectThumbKey(preset)], preset).toBeTruthy();
    }
  });
});
