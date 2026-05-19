/**
 * Canonical field definitions for all layer kinds.
 *
 * Single source of truth for slider ranges and select options. Both the
 * classic Sidebar and the node LayerControls must import from here so
 * adding/changing a field never causes surface drift.
 */

// Select options.

export const BLEND_OPTIONS = ['normal', 'multiply', 'screen', 'overlay', 'luminosity'] as const;
export type BlendMode = (typeof BLEND_OPTIONS)[number];
export const BLEND_MODE_HELP: Record<BlendMode, string> = {
  normal: 'Draws this node over what is below. Use it when the node should replace or sit plainly on top.',
  multiply: 'Keeps dark ink and darkens the backdrop. Good for shadows, grain, paper texture, and printed dirt.',
  screen: 'Keeps light pixels and brightens the backdrop. Good for glow, haze, bloom, and light leaks.',
  overlay: 'Adds contrast from this node into the backdrop. Good for punchy texture without fully replacing color.',
  luminosity: 'Uses this node brightness while preserving backdrop color. Good for masks, light maps, and tone passes.',
};

export const TEXT_ALIGN_OPTIONS = ['left', 'center', 'right'] as const;
export const IMAGE_FIT_OPTIONS = ['cover', 'contain', 'tile', 'free'] as const;
export const PRIMITIVE_SHAPE_OPTIONS = ['sphere', 'cube', 'cylinder'] as const;
export const PRIMITIVE_SHADING_OPTIONS = ['smooth', 'flat'] as const;
export const NOISE_TYPE_OPTIONS = ['value', 'clouds', 'cells'] as const;
export const ARRAY_PATTERN_OPTIONS = ['line', 'grid', 'radial'] as const;
export const ARRAY_SHAPE_OPTIONS = ['disc', 'bar', 'diamond'] as const;

// Numeric field ranges.
//
// Normalized fields (x, y, scaleX, scaleY): the layer stores a 0–1 fraction;
// each surface displays it as an integer (×100). The slider range below is in
// display units (e.g. –200 to 200 means –2.0 to +2.0 as stored fractions).

export const FIELD_RANGES = {
  // Common
  opacity: { min: 0, max: 100, step: 1 },
  blur: { min: 0, max: 100, step: 1 },
  rotation: { min: -180, max: 180, step: 1 },

  // Position (normalized): displayed as int ×100, stored as 0–1
  x: { min: -200, max: 200, step: 1 },
  y: { min: -200, max: 200, step: 1 },

  // Scale (normalized): displayed as percent, stored as fraction
  scaleX: { min: 5, max: 500, step: 1 },
  scaleY: { min: 5, max: 500, step: 1 },

  // Text
  size: { min: 8, max: 160, step: 1 },

  // Emoji
  density: { min: 1, max: 100, step: 1 },
  minSz: { min: 10, max: 60, step: 1 },
  maxSz: { min: 40, max: 130, step: 1 },

  // Primitive
  seedOffset: { min: -999, max: 999, step: 1 },
  tiltZ: { min: -180, max: 180, step: 1 },
  primitiveDepth: { min: 10, max: 100, step: 1 },

  // Noise
  noiseScale: { min: 1, max: 128, step: 1 },
  noiseDetail: { min: 1, max: 8, step: 1 },
  noiseContrast: { min: 0, max: 100, step: 1 },
  noiseBalance: { min: 0, max: 95, step: 1 },
  noiseWarp: { min: 0, max: 100, step: 1 },
  noiseTurbulence: { min: 0, max: 100, step: 1 },
  noiseThreshold: { min: 0, max: 100, step: 1 },

  // Array
  arrayCount: { min: 2, max: 18, step: 1 },
  arrayRows: { min: 1, max: 12, step: 1 },
  arrayGap: { min: 12, max: 96, step: 1 },
  arraySize: { min: 8, max: 64, step: 1 },
  arrayRadius: { min: 16, max: 180, step: 1 },
  arrayJitter: { min: 0, max: 36, step: 1 },
} as const;
