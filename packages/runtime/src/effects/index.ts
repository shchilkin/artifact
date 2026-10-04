import { createEffectRegistry } from '../registry.js';
import { noiseWarp } from './noiseWarp.js';

export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
