import { describe, expect, it } from 'vitest';
import { ARRAY_PRESET_IDS, makeArrayPresetLayer } from './arrayPresets';

describe('arrayPresets', () => {
  it('creates serializable array layers for every preset', () => {
    for (const presetId of ARRAY_PRESET_IDS) {
      const layer = makeArrayPresetLayer(presetId);

      expect(layer.kind).toBe('array');
      expect(layer.name).toBeTruthy();
      expect(layer.arrayCount).toBeGreaterThan(0);
      expect(layer.arrayRows).toBeGreaterThan(0);
      expect(layer.arraySize).toBeGreaterThan(0);
      expect(() => JSON.stringify(layer)).not.toThrow();
    }
  });
});
