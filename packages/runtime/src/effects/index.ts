import { createEffectRegistry } from '../registry.js';
import { ca } from './ca.js';
import { dataMosh } from './dataMosh.js';
import { glitch } from './glitch.js';
import { grain } from './grain.js';
import { morph } from './morph.js';
import { noiseWarp } from './noiseWarp.js';
import { vortex } from './vortex.js';

export { CA_FRAG, type CaLayer, ca } from './ca.js';
export { type DataMoshLayer, dataMosh } from './dataMosh.js';
export {
  GLITCH_FRAG,
  GLITCH_MAX_BANDS,
  type GlitchBands,
  type GlitchLayer,
  glitch,
  glitchBands,
  glitchLcg,
} from './glitch.js';
export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type MorphLayer, morph } from './morph.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, vortex, grain, morph, ca, dataMosh, glitch] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
