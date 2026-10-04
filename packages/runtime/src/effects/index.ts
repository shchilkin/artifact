import { createEffectRegistry } from '../registry.js';
import { grain } from './grain.js';
import { noiseWarp } from './noiseWarp.js';

export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, grain] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
