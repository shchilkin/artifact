import { describe, expect, it } from 'vitest';
import { makeNoisePresetLayer, NOISE_PRESET_IDS } from './noisePresets';

describe('noisePresets', () => {
  it('creates serializable noise layers for every preset', () => {
    for (const presetId of NOISE_PRESET_IDS) {
      const layer = makeNoisePresetLayer(presetId);

      expect(layer.kind).toBe('noise');
      expect(layer.name).toBeTruthy();
      expect(layer.noiseScale).toBeGreaterThan(0);
      expect(layer.noiseContrast).toBeGreaterThanOrEqual(0);
      expect(layer.noiseContrast).toBeLessThanOrEqual(100);
      expect(() => JSON.stringify(layer)).not.toThrow();
    }
  });
});
