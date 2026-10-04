import { HEADER, NOISE_FRAG } from '@artifact/shared/effect-shaders';
import { describe, expect, it } from 'vitest';
import { EFFECTS, effectRegistry, GRAIN_FRAG, grain, noiseWarp, SCANLINES_FRAG, scanlines } from './effects/index.js';
import { createEffectRegistry, DEFAULT_CENTER, defineEffect } from './registry.js';
import type { UniformValues } from './types.js';

const context = { seed: 42, width: 540, height: 540 };

describe('effect registry', () => {
  it('registers Noise Warp with the editor fragment, by reference', () => {
    expect(effectRegistry.ids()).toContain('noiseWarp');
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

  it('registers Grain as a stochastic port that boils on its seed', () => {
    expect(effectRegistry.get('grain')).toBe(grain);
    expect(grain.fragment).toBe(GRAIN_FRAG);
    expect(grain.fragment.startsWith(HEADER)).toBe(true);
    expect(grain.stochastic).toBe(true);
    expect(grain.centered).toBe(false);
    expect(grain.fields).toEqual(['grain', 'seedOffset']);
  });

  it('maps authored Grain fields to the amount and the layer seed', () => {
    const pass = effectRegistry.pass('grain', { grain: 26, seedOffset: 3 }, context);
    expect(pass).toEqual({ id: 'grain', fragment: GRAIN_FRAG, uniforms: { uGrain: 26, uSeed: 45 } });
    expect(effectRegistry.pass('grain', { grain: 0 }, context)).toBeNull();
  });

  it('registers Scanlines as a deterministic port with a bindable offset', () => {
    expect(effectRegistry.get('scanlines')).toBe(scanlines);
    expect(scanlines.fragment).toBe(SCANLINES_FRAG);
    expect(scanlines.fragment.startsWith(HEADER)).toBe(true);
    expect(scanlines.stochastic).toBe(false);
    expect(scanlines.centered).toBe(false);
    expect(scanlines.fields).toEqual(['scanlines', 'scanlineWidth']);
  });

  it('maps authored Scanlines fields to the line alpha and width, resting at offset 0', () => {
    const pass = effectRegistry.pass('scanlines', { scanlines: 18, scanlineWidth: 2 }, context);
    expect(pass).toEqual({
      id: 'scanlines',
      fragment: SCANLINES_FRAG,
      uniforms: { uAlpha: 0.18, uLineWidth: 2, uOffset: 0 },
    });
    expect(effectRegistry.uniforms('scanlines', { scanlines: 40 }, context)).toMatchObject({ uLineWidth: 1 });
    expect(effectRegistry.pass('scanlines', { scanlines: 0, scanlineWidth: 2 }, context)).toBeNull();
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
