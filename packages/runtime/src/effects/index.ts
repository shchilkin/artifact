import { createEffectRegistry } from '../registry.js';
import { grain } from './grain.js';
import { noiseWarp } from './noiseWarp.js';
import { tear } from './tear.js';
import { vortex } from './vortex.js';

export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export { type TearLayer, tear } from './tear.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, vortex, grain, tear] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
