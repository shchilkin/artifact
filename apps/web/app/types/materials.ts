/** Primitive surface materials: the stored material fields, texture inputs, and material presets. */

export type MaterialPreset =
  | 'matte'
  | 'goldFoil'
  | 'chrome'
  | 'brushedMetal'
  | 'pearl'
  | 'plastic'
  | 'paper'
  | 'fabric';

export interface MaterialConfig {
  materialPreset: MaterialPreset;
  materialBaseColor: string;
  materialAccentColor: string;
  materialMetalness: number;
  materialRoughness: number;
  materialClearcoat: number;
  materialRelief: number;
  materialGrain: number;
  materialAnisotropy: number;
  materialAlbedoSrc?: string;
  materialAlbedoName?: string;
  materialAlbedoBytes?: number;
  materialRoughnessSrc?: string;
  materialRoughnessName?: string;
  materialRoughnessBytes?: number;
  materialMetalnessSrc?: string;
  materialMetalnessName?: string;
  materialMetalnessBytes?: number;
  materialNormalSrc?: string;
  materialNormalName?: string;
  materialNormalBytes?: number;
  materialAlphaSrc?: string;
  materialAlphaName?: string;
  materialAlphaBytes?: number;
}

export const MATERIAL_TEXTURE_SOURCE_FIELDS = [
  'materialAlbedoSrc',
  'materialRoughnessSrc',
  'materialMetalnessSrc',
  'materialNormalSrc',
  'materialAlphaSrc',
] as const;

export const MATERIAL_TEXTURE_INPUT_PORTS = ['albedo', 'roughness', 'metalness', 'normal', 'alpha'] as const;

export type MaterialTextureInputPort = (typeof MATERIAL_TEXTURE_INPUT_PORTS)[number];

export const DEFAULT_MATERIAL_CONFIG: MaterialConfig = {
  materialPreset: 'matte',
  materialBaseColor: '#ff5a36',
  materialAccentColor: '#9d5cff',
  materialMetalness: 0.18,
  materialRoughness: 0.38,
  materialClearcoat: 0,
  materialRelief: 0,
  materialGrain: 0,
  materialAnisotropy: 0,
};

export const MATERIAL_PRESET_LABELS: Record<MaterialPreset, string> = {
  matte: 'Matte',
  goldFoil: 'Gold Foil',
  chrome: 'Chrome',
  brushedMetal: 'Brushed Metal',
  pearl: 'Pearl',
  plastic: 'Plastic',
  paper: 'Paper',
  fabric: 'Fabric',
};

export const MATERIAL_PRESETS: Record<MaterialPreset, MaterialConfig> = {
  matte: DEFAULT_MATERIAL_CONFIG,
  goldFoil: {
    materialPreset: 'goldFoil',
    materialBaseColor: '#b98222',
    materialAccentColor: '#ffe28a',
    materialMetalness: 0.95,
    materialRoughness: 0.24,
    materialClearcoat: 0.34,
    materialRelief: 0.38,
    materialGrain: 0.42,
    materialAnisotropy: 0.18,
  },
  chrome: {
    materialPreset: 'chrome',
    materialBaseColor: '#d6dde4',
    materialAccentColor: '#ffffff',
    materialMetalness: 1,
    materialRoughness: 0.08,
    materialClearcoat: 0.7,
    materialRelief: 0.04,
    materialGrain: 0,
    materialAnisotropy: 0,
  },
  brushedMetal: {
    materialPreset: 'brushedMetal',
    materialBaseColor: '#9fa7ad',
    materialAccentColor: '#f1f4f0',
    materialMetalness: 0.92,
    materialRoughness: 0.42,
    materialClearcoat: 0.2,
    materialRelief: 0.18,
    materialGrain: 0.54,
    materialAnisotropy: 0.8,
  },
  pearl: {
    materialPreset: 'pearl',
    materialBaseColor: '#f4edf0',
    materialAccentColor: '#b8e7ff',
    materialMetalness: 0,
    materialRoughness: 0.18,
    materialClearcoat: 0.88,
    materialRelief: 0.12,
    materialGrain: 0.08,
    materialAnisotropy: 0.16,
  },
  plastic: {
    materialPreset: 'plastic',
    materialBaseColor: '#e84b73',
    materialAccentColor: '#ffd3df',
    materialMetalness: 0,
    materialRoughness: 0.28,
    materialClearcoat: 0.58,
    materialRelief: 0.04,
    materialGrain: 0,
    materialAnisotropy: 0,
  },
  paper: {
    materialPreset: 'paper',
    materialBaseColor: '#d7d0bf',
    materialAccentColor: '#fff7df',
    materialMetalness: 0,
    materialRoughness: 0.86,
    materialClearcoat: 0,
    materialRelief: 0.28,
    materialGrain: 0.68,
    materialAnisotropy: 0,
  },
  fabric: {
    materialPreset: 'fabric',
    materialBaseColor: '#5d6570',
    materialAccentColor: '#c5ced2',
    materialMetalness: 0,
    materialRoughness: 0.92,
    materialClearcoat: 0,
    materialRelief: 0.44,
    materialGrain: 0.78,
    materialAnisotropy: 0.52,
  },
};
