import { BARREL_FRAG, HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER } from '../registry.js';
import { barrel, effectRegistry } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('barrel', () => {
  it('registers the editor fragment by reference, centred and deterministic', () => {
    expect(effectRegistry.get('barrel')).toBe(barrel);
    expect(barrel.fragment).toBe(BARREL_FRAG);
    expect(barrel.fragment.startsWith(HEADER)).toBe(true);
    expect(barrel.fragment).toMatch(/uniform\s+vec2\s+uCenter\s*;/);
    expect(barrel.centered).toBe(true);
    expect(barrel.stochastic).toBe(false);
    expect(barrel.fields).toEqual(['barrel']);
  });

  it('maps the authored amount to the editor uniform with the default centre', () => {
    expect(effectRegistry.pass('barrel', { barrel: 60 }, context)).toEqual({
      id: 'barrel',
      fragment: BARREL_FRAG,
      uniforms: { uCenter: DEFAULT_CENTER, uK: 60 * 0.04 },
    });
    expect(DEFAULT_CENTER).toEqual([0.5, 0.5]);
  });

  it('is off at zero, as in the editor filter builder', () => {
    expect(effectRegistry.pass('barrel', { barrel: 0 }, context)).toBeNull();
  });
});
