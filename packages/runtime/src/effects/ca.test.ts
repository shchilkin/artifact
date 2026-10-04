import { HEADER } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER } from '../registry.js';
import { CA_FRAG, ca, effectRegistry } from './index.js';

const context = { seed: 42, width: 540, height: 540 };

describe('ca', () => {
  it('registers the port centred and deterministic', () => {
    expect(effectRegistry.get('ca')).toBe(ca);
    expect(ca.fragment).toBe(CA_FRAG);
    expect(ca.fragment.startsWith(HEADER)).toBe(true);
    expect(ca.fragment).toMatch(/uniform\s+vec2\s+uCenter\s*;/);
    expect(ca.centered).toBe(true);
    expect(ca.stochastic).toBe(false);
    expect(ca.fields).toEqual(['ca']);
  });

  it('passes the authored amount with the default centre', () => {
    expect(effectRegistry.pass('ca', { ca: 15 }, context)).toEqual({
      id: 'ca',
      fragment: CA_FRAG,
      uniforms: { uCenter: DEFAULT_CENTER, uCa: 15 },
    });
  });

  it('is off at zero, as in the editor colour pass', () => {
    expect(effectRegistry.pass('ca', { ca: 0 }, context)).toBeNull();
  });
});
