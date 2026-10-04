import { createEffectRegistry } from '../registry.js';
import { barrel } from './barrel.js';
import { ca } from './ca.js';
import { dataMosh } from './dataMosh.js';
import { glitch } from './glitch.js';
import { grain } from './grain.js';
import { morph } from './morph.js';
import { noiseWarp } from './noiseWarp.js';
import { pixelate } from './pixelate.js';
import { rgbSplit } from './rgbSplit.js';
import { ripple } from './ripple.js';
import { scanlines } from './scanlines.js';
import { tear } from './tear.js';
import { vortex } from './vortex.js';

export { type BarrelLayer, barrel } from './barrel.js';
export { CA_FRAG, type CaLayer, ca } from './ca.js';
export { type DataMoshLayer, dataMosh } from './dataMosh.js';
export {
  GLITCH_FRAG,
  GLITCH_MAX_BANDS,
  type GlitchBand,
  type GlitchLayer,
  glitch,
  glitchBands,
  glitchLcg,
  glitchUniforms,
} from './glitch.js';
export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type MorphLayer, morph } from './morph.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export {
  PIXELATE_REVEAL_FRAG,
  PIXELATE_REVEAL_LEVELS,
  PIXELATE_SOFTNESS,
  type PixelateLayer,
  pixelate,
} from './pixelate.js';
export { RGB_SPLIT_OFFSET_FRAG, type RgbSplitLayer, rgbSplit, rgbSplitDirection } from './rgbSplit.js';
export {
  RIPPLE_CLICK_DECAY,
  RIPPLE_CLICK_SPEED,
  RIPPLE_FRAG,
  type RippleLayer,
  ripple,
} from './ripple.js';
export { SCANLINES_FRAG, type ScanlinesLayer, scanlines } from './scanlines.js';
export { type TearLayer, tear } from './tear.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [
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
  barrel,
] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
