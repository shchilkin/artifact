import { describe, expect, it } from 'vitest';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../types/config';
import { EFFECT_DOCS, EFFECT_FAMILY_GUIDE } from './effectDocs';

describe('effectDocs', () => {
  it('documents every effect preset shown in the add menu', () => {
    expect(Object.keys(EFFECT_DOCS).sort()).toEqual(Object.keys(EFFECT_PRESETS).sort());

    for (const preset of EFFECT_PRESET_MENU_ORDER) {
      const docs = EFFECT_DOCS[preset];

      expect(docs.description).toBeTruthy();
      expect(docs.params.length).toBeGreaterThan(0);
      expect(docs.params.every((param) => param.key && param.range)).toBe(true);
    }
  });

  it('keeps the effect family guide useful for the docs route', () => {
    expect(EFFECT_FAMILY_GUIDE.length).toBeGreaterThanOrEqual(5);
    expect(EFFECT_FAMILY_GUIDE.map((family) => family.name)).toContain('Texture');
    expect(EFFECT_FAMILY_GUIDE.map((family) => family.name)).toContain('Signal Damage');
  });
});
