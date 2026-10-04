import type { EffectCase } from '../../src/testing/effectCase.js';
import ca from './ca.js';
import dataMosh from './dataMosh.js';
import glitch from './glitch.js';
import grain from './grain.js';
import morph from './morph.js';
import noiseWarp from './noiseWarp.js';
import pixelate from './pixelate.js';
import rgbSplit from './rgbSplit.js';
import ripple from './ripple.js';
import scanlines from './scanlines.js';
import tear from './tear.js';
import vignette from './vignette.js';
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
  ripple,
  pixelate,
  vignette,
};
