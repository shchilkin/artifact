import { HEADER, VORTEX_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER } from '../registry.js';
import { effectRegistry, vortex } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('vortex', () => {
  it('registers the editor fragment by reference, centred and deterministic', () => {
    expect(effectRegistry.get('vortex')).toBe(vortex);
    expect(vortex.fragment).toBe(VORTEX_FRAG);
    expect(vortex.fragment.startsWith(HEADER)).toBe(true);
    expect(vortex.fragment).toMatch(/uniform\s+vec2\s+uCenter\s*;/);
    expect(vortex.centered).toBe(true);
    expect(vortex.stochastic).toBe(false);
    expect(vortex.fields).toEqual(['vortex']);
  });

  it('maps the authored amount to the editor uniform with the default centre', () => {
    expect(effectRegistry.pass('vortex', { vortex: 40 }, context)).toEqual({
      id: 'vortex',
      fragment: VORTEX_FRAG,
      uniforms: { uCenter: DEFAULT_CENTER, uIntensity: 40 * 0.03 },
    });
    expect(DEFAULT_CENTER).toEqual([0.5, 0.5]);
  });

  it('is off at zero, as in the editor filter builder', () => {
    expect(effectRegistry.pass('vortex', { vortex: 0 }, context)).toBeNull();
  });
});
