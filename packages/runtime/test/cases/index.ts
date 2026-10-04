import type { EffectCase } from '../../src/testing/effectCase.js';
import ca from './ca.js';
import dataMosh from './dataMosh.js';
import glitch from './glitch.js';
import grain from './grain.js';
import morph from './morph.js';
import noiseWarp from './noiseWarp.js';
import rgbSplit from './rgbSplit.js';
import scanlines from './scanlines.js';
import tear from './tear.js';
import vortex from './vortex.js';

/** Every harness case, keyed by effect id. An effect issue adds its case file here. */
export const EFFECT_CASES: Readonly<Record<string, EffectCase>> = {
  noiseWarp,
  vortex,
  grain,
  morph,
  ca,
  dataMosh,
  scanlines,
  tear,
  glitch,
  rgbSplit,
};
