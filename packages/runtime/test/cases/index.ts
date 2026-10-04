import type { EffectCase } from '../../src/testing/effectCase.js';
import ca from './ca.js';
import dataMosh from './dataMosh.js';
import grain from './grain.js';
import morph from './morph.js';
import noiseWarp from './noiseWarp.js';
import vortex from './vortex.js';

/** Every harness case, keyed by effect id. An effect issue adds its case file here. */
export const EFFECT_CASES: Readonly<Record<string, EffectCase>> = {
  noiseWarp,
  vortex,
  grain,
  morph,
  ca,
  dataMosh,
};
