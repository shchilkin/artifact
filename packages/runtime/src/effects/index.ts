import { createEffectRegistry } from '../registry.js';
import { grain } from './grain.js';
import { noiseWarp } from './noiseWarp.js';
import { scanlines } from './scanlines.js';
import { vortex } from './vortex.js';

export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export { SCANLINES_FRAG, type ScanlinesLayer, scanlines } from './scanlines.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, vortex, grain, scanlines] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
