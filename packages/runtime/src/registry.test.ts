import { HEADER, NOISE_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { EFFECTS, effectRegistry, noiseWarp } from './effects/index.js';
import { createEffectRegistry, DEFAULT_CENTER, defineEffect } from './registry.js';
import type { UniformValues } from './types.js';

const context = { seed: 42, width: 540, height: 540 };

describe('effect registry', () => {
  it('registers Noise Warp with the editor fragment, by reference', () => {
    expect(effectRegistry.ids()).toEqual(['noiseWarp']);
    expect(effectRegistry.get('noiseWarp')).toBe(noiseWarp);
    // Imported from the editor's shared shader source, not a copy.
    expect(noiseWarp.fragment).toBe(NOISE_FRAG);
    expect(noiseWarp.fragment.startsWith(HEADER)).toBe(true);
    expect(noiseWarp.stochastic).toBe(false);
    expect(noiseWarp.centered).toBe(false);
  });

  it('maps authored Noise Warp fields to the editor uniforms', () => {
    const pass = effectRegistry.pass('noiseWarp', { noiseWarp: 50, seedOffset: 7 }, context);
    expect(pass).toEqual({ id: 'noiseWarp', fragment: NOISE_FRAG, uniforms: { uIntensity: 50 * 0.0008, uSeed: 49 } });
  });

  it('treats a missing seed offset as zero', () => {
    expect(noiseWarp.uniforms({ noiseWarp: 10 }, context)).toEqual({ uIntensity: 10 * 0.0008, uSeed: 42 });
  });

  it('skips an effect whose amount is zero, as the editor filter builder does', () => {
    expect(effectRegistry.pass('noiseWarp', { noiseWarp: 0 }, context)).toBeNull();
  });

  it('rejects unknown ids and duplicate registrations', () => {
    expect(() => effectRegistry.pass('nope', {}, context)).toThrow('Unknown effect "nope"');
    expect(() => createEffectRegistry([...EFFECTS, noiseWarp])).toThrow('registered twice');
  });

  it('gives centred effects a default uCenter that per-layer uniforms can override', () => {
    const centred = defineEffect<{ amount: number; cx?: number; seedOffset?: number }>({
      id: 'centred',
      fragment: `${HEADER}\nuniform vec2 uCenter;\nvoid main() { gl_FragColor = vec4(uCenter, 0.0, 1.0); }`,
      fields: ['amount', 'cx'],
      amount: (layer) => layer.amount,
      uniforms: (layer): UniformValues =>
        layer.cx === undefined ? { uAmount: layer.amount } : { uCenter: [layer.cx, 0.5] },
      centered: true,
      stochastic: false,
    });
    const registry = createEffectRegistry([centred]);
    expect(registry.pass('centred', { amount: 1 }, context)?.uniforms).toEqual({
      uCenter: DEFAULT_CENTER,
      uAmount: 1,
    });
    expect(registry.pass('centred', { amount: 1, cx: 0.2 }, context)?.uniforms).toEqual({
      uCenter: [0.2, 0.5],
    });
  });

  it('refuses a centred effect whose fragment has no uCenter uniform', () => {
    const broken = defineEffect({ ...noiseWarp, id: 'broken', centered: true });
    expect(() => createEffectRegistry([broken])).toThrow('does not declare uniform vec2 uCenter');
  });
});
