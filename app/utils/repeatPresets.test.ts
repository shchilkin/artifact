import { describe, expect, it } from 'vitest';

import { makeRepeatPresetNode, REPEAT_PRESET_IDS, REPEAT_PRESETS } from './repeatPresets';

describe('repeatPresets', () => {
  it('creates serializable graph repeat nodes for every preset', () => {
    for (const preset of REPEAT_PRESET_IDS) {
      const node = makeRepeatPresetNode(preset);

      expect(node).toMatchObject(REPEAT_PRESETS[preset].patch);
      expect(node.id).toMatch(/^repeat-/);
      expect(node.count).toBeGreaterThan(0);
      expect(node.rows).toBeGreaterThan(0);
      expect(node.opacity).toBeGreaterThanOrEqual(0);
      expect(node.opacity).toBeLessThanOrEqual(100);
      expect(JSON.parse(JSON.stringify(node))).toEqual(node);
    }
  });
});
