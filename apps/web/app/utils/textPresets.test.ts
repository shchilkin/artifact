import { describe, expect, it } from 'vitest';

import { makeTextPresetLayer, TEXT_PRESET_IDS, TEXT_PRESETS } from './textPresets';

describe('textPresets', () => {
  it('defines focused text starts with existing text fields', () => {
    expect(TEXT_PRESET_IDS).toEqual(['title', 'subtitle', 'label', 'credit', 'poster']);

    for (const preset of TEXT_PRESET_IDS) {
      const layer = makeTextPresetLayer(preset);

      expect(layer.kind).toBe('text');
      expect(layer.content.trim().length).toBeGreaterThan(0);
      expect(layer.name).toBe(TEXT_PRESETS[preset].name);
      expect(layer.x).toBeGreaterThanOrEqual(0);
      expect(layer.x).toBeLessThanOrEqual(1);
      expect(layer.y).toBeGreaterThanOrEqual(0);
      expect(layer.y).toBeLessThanOrEqual(1);
    }
  });

  it('lets callers override preset fields without changing the preset model', () => {
    const layer = makeTextPresetLayer('title', { content: 'CUSTOM', size: 44 });

    expect(layer.content).toBe('CUSTOM');
    expect(layer.size).toBe(44);
    expect(layer.name).toBe('Title Type');
  });
});
