import type { EffectCase } from '../../src/testing/effectCase.js';
import noiseWarp from './noiseWarp.js';
import tear from './tear.js';
import vortex from './vortex.js';

/** Every harness case, keyed by effect id. An effect issue adds its case file here. */
export const EFFECT_CASES: Readonly<Record<string, EffectCase>> = {
  noiseWarp,
  vortex,
  tear,
};
