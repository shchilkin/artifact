import { describe, expect, it } from 'vitest';
import { lcg } from '../utils/lcg';
import {
  isKernelActive,
  KERNEL_IDS,
  KERNEL_PARAM_DEFAULTS,
  type KernelId,
  type KernelParamValues,
  kernelOfPreset,
  kernelParam,
  kernelParamKeys,
} from './effectKernels';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from './effectPresets';
import { ABSORBED_KERNELS, EFFECT_IDS, effectDefaults, effectOfKernel, effectSpec } from './effectSchema';

/** Kernel values to round-trip: each preset of the kernel, plus seeded random values inside the parameter ranges. */
function sampleValues(kernel: KernelId): KernelParamValues[] {
  const presets = EFFECT_PRESET_MENU_ORDER.filter((preset) => kernelOfPreset(preset) === kernel).map((preset) => ({
    ...KERNEL_PARAM_DEFAULTS,
    ...EFFECT_PRESETS[preset].partial,
  }));
  const rng = lcg(kernel.length * 7919);
  const random = Array.from({ length: 6 }, () => {
    const values: Record<string, unknown> = { ...KERNEL_PARAM_DEFAULTS };
    for (const key of kernelParamKeys(kernel)) {
      const param = kernelParam(key);
      if (param.type === 'number')
        values[key] = Math.round(param.min + rng() * ((param.overrideMax ?? param.max) - param.min));
      else if (param.type === 'choice') values[key] = param.options[Math.floor(rng() * param.options.length)].value;
      else
        values[key] = `#${Math.floor(rng() * 0xffffff)
          .toString(16)
          .padStart(6, '0')}`;
    }
    return values as KernelParamValues;
  });
  return [...presets, ...random];
}

function ownValues(kernel: KernelId, values: Partial<KernelParamValues>) {
  return Object.fromEntries(kernelParamKeys(kernel).map((key) => [key, values[key] ?? KERNEL_PARAM_DEFAULTS[key]]));
}

describe('effect catalog', () => {
  it('gives every kernel exactly one effect', () => {
    expect([...ABSORBED_KERNELS].sort()).toEqual([...KERNEL_IDS].sort());
    const owners = EFFECT_IDS.flatMap((effect) => Object.keys(effectSpec(effect).absorbs));
    expect(owners.length).toBe(new Set(owners).size);
  });

  it.each(KERNEL_IDS)('reproduces %s values exactly from the parameters its effect absorbs them into', (kernel) => {
    const spec = effectSpec(effectOfKernel(kernel));
    for (const values of sampleValues(kernel)) {
      const params = { ...effectDefaults(effectOfKernel(kernel)), ...spec.absorbs[kernel]?.(values) };
      const calls = spec
        .kernels(params)
        .filter((call) => isKernelActive({ ...KERNEL_PARAM_DEFAULTS, ...call.values }, call.kernel));
      if (!isKernelActive(values, kernel)) {
        expect(calls).toEqual([]);
        continue;
      }
      expect(calls.map((call) => call.kernel)).toEqual([kernel]);
      expect(ownValues(kernel, calls[0].values)).toEqual(ownValues(kernel, values));
    }
  });

  it('keeps parameter specs consistent', () => {
    for (const effect of EFFECT_IDS) {
      const spec = effectSpec(effect);
      expect(
        Object.values(spec.params).some((param) => param.type === 'number'),
        effect,
      ).toBe(true);
      for (const preset of Object.values(spec.modePresets ?? {})) {
        expect(effectOfKernel(kernelOfPreset(preset)), `${effect} mode preset ${preset}`).toBe(effect);
      }
      for (const [key, param] of Object.entries(spec.params)) {
        if (!param.when) continue;
        const gate = spec.params[param.when.param];
        expect(gate?.type, `${effect}.${key}`).toBe('choice');
        const options = gate?.type === 'choice' ? gate.options.map((option) => option.value) : [];
        for (const value of param.when.values) expect(options, `${effect}.${key}`).toContain(value);
      }
    }
  });
});
