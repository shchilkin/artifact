import { createEffectRegistry } from '../registry.js';
import { morph } from './morph.js';
import { noiseWarp } from './noiseWarp.js';
import { vortex } from './vortex.js';

export { type MorphLayer, morph } from './morph.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, vortex, morph] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
