import type { EffectCase } from '../../src/testing/effectCase.js';
import grain from './grain.js';
import noiseWarp from './noiseWarp.js';

/** Every harness case, keyed by effect id. An effect issue adds its case file here. */
export const EFFECT_CASES: Readonly<Record<string, EffectCase>> = {
  noiseWarp,
  grain,
};
