import { createEffectRegistry } from '../registry.js';
import { grain } from './grain.js';
import { morph } from './morph.js';
import { noiseWarp } from './noiseWarp.js';
import { vortex } from './vortex.js';

export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type MorphLayer, morph } from './morph.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, vortex, grain, morph] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
