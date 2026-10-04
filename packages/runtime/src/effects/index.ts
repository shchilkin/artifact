import { createEffectRegistry } from '../registry.js';
import { ca } from './ca.js';
import { dataMosh } from './dataMosh.js';
import { grain } from './grain.js';
import { morph } from './morph.js';
import { noiseWarp } from './noiseWarp.js';
import { scanlines } from './scanlines.js';
import { tear } from './tear.js';
import { vortex } from './vortex.js';

export { CA_FRAG, type CaLayer, ca } from './ca.js';
export { type DataMoshLayer, dataMosh } from './dataMosh.js';
export { GRAIN_FRAG, type GrainLayer, grain } from './grain.js';
export { type MorphLayer, morph } from './morph.js';
export { type NoiseWarpLayer, noiseWarp } from './noiseWarp.js';
export { SCANLINES_FRAG, type ScanlinesLayer, scanlines } from './scanlines.js';
export { type TearLayer, tear } from './tear.js';
export { type VortexLayer, vortex } from './vortex.js';

/** Every effect the runtime can run. */
export const EFFECTS = [noiseWarp, vortex, grain, morph, ca, dataMosh, scanlines, tear] as const;

export const effectRegistry = createEffectRegistry(EFFECTS);
