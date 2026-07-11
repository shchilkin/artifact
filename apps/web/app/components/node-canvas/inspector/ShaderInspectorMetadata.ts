import type { ShaderKind } from '../../../types/config';

export type ShaderShapeControlField = 'distortion' | 'swirl' | 'scale';
export type ShaderPlacementControlField = 'rotation' | 'offsetX' | 'offsetY';

export interface ShaderPresetControlConfig {
  shape: readonly ShaderShapeControlField[];
  placement: readonly ShaderPlacementControlField[];
}

const FULL_SHAPE = ['distortion', 'swirl', 'scale'] as const;
const FULL_PLACEMENT = ['rotation', 'offsetX', 'offsetY'] as const;
const OFFSET_PLACEMENT = ['offsetX', 'offsetY'] as const;

const PRESET_CONTROL_CONFIGS: Record<string, ShaderPresetControlConfig> = {
  paperTexture: config([], FULL_PLACEMENT),
  water: config(['swirl'], FULL_PLACEMENT),
  waterCaustic: config(['distortion', 'scale'], FULL_PLACEMENT),
  heatmap: config([], FULL_PLACEMENT),
  liquidMetal: config([], FULL_PLACEMENT),
  gemSmoke: config([], FULL_PLACEMENT),
  meshGradient: config(FULL_SHAPE, FULL_PLACEMENT),
  staticRadialGradient: config(['scale'], OFFSET_PLACEMENT),
  grainGradient: config(['scale'], OFFSET_PLACEMENT),
  dotOrbit: config(['swirl', 'scale'], ['rotation']),
  dotGrid: config(['distortion', 'scale'], []),
  moire: config(FULL_SHAPE, FULL_PLACEMENT),
  concentricPatterns: config(FULL_SHAPE, FULL_PLACEMENT),
  spiral: config(['swirl', 'scale'], FULL_PLACEMENT),
  swirl: config(['scale'], FULL_PLACEMENT),
  waves: config(FULL_SHAPE, FULL_PLACEMENT),
  glowingWave: config(FULL_SHAPE, FULL_PLACEMENT),
  neuroNoise: config([], FULL_PLACEMENT),
  perlin: config(['scale'], FULL_PLACEMENT),
  simplexNoise: config(['scale'], FULL_PLACEMENT),
  voronoi: config(['scale'], FULL_PLACEMENT),
  borderRings: config([], []),
  metaballs: config(FULL_SHAPE, FULL_PLACEMENT),
  colorPanels: config(['scale'], []),
  smokeRing: config([], FULL_PLACEMENT),
  noiseField: config(FULL_SHAPE, FULL_PLACEMENT),
  marble: config(FULL_SHAPE, FULL_PLACEMENT),
  liquid: config(FULL_SHAPE, FULL_PLACEMENT),
  tilelessTexture: config(['scale'], FULL_PLACEMENT),
};

const EMPTY_CONFIG = config([], []);

export function shaderPresetControlConfig(shaderKind: ShaderKind): ShaderPresetControlConfig {
  return PRESET_CONTROL_CONFIGS[shaderKind] ?? EMPTY_CONFIG;
}

function config(
  shape: readonly ShaderShapeControlField[],
  placement: readonly ShaderPlacementControlField[],
): ShaderPresetControlConfig {
  return { shape, placement };
}
