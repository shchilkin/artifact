export type ShaderPaletteConfig = {
  min: number;
  defaultCount: number;
  max: number;
  addable: boolean;
  defaults: string[];
};

const DEFAULT_SHADER_PALETTE = ['#ff705f', '#8d5cff', '#79e3c5', '#f6c96f'] as const;
const THREE_TONE_BLUE = ['#031a2f', '#0877a8', '#79f7ff'] as const;
const WARM_TEXTURE = ['#1c120b', '#b0703f', '#f7e2b8'] as const;
const LINE_ART = ['#05030a', '#f7e6ff'] as const;

export const SHADER_PALETTE_CONFIGS: Record<string, ShaderPaletteConfig> = {
  paperTexture: paletteConfig(['#e8decf', '#bda98f', '#f7efe1'], 2, 5),
  water: paletteConfig(THREE_TONE_BLUE, 2, 5),
  waterCaustic: paletteConfig(['#03202f', '#0877a8', '#79f7ff', '#f3fff2'], 2, 5),
  heatmap: paletteConfig(['#141a33', '#0077ff', '#f7d23b', '#ff3b30'], 3, 6),
  liquidMetal: paletteConfig(['#1d2027', '#93a3b8', '#e8edf5', '#5d748c'], 3, 6),
  gemSmoke: paletteConfig(['#180b2d', '#6c4dff', '#2ef0c5', '#fff1c9'], 3, 6),
  meshGradient: paletteConfig(DEFAULT_SHADER_PALETTE, 2, 8),
  staticRadialGradient: paletteConfig(['#0c1024', '#ff705f', '#79e3c5'], 2, 8),
  grainGradient: paletteConfig(['#06040a', '#f7e6ff', '#ff6ab7', '#50e3c2'], 2, 8),
  dotOrbit: paletteConfig(['#050207', '#45f2a8', '#ff6a5f', '#ffe184'], 2, 5),
  dotGrid: paletteConfig(['#ffe184', '#7b61ff', '#ff3b30'], 2, 5),
  moire: paletteConfig(LINE_ART, 2, 4),
  concentricPatterns: paletteConfig(['#09030f', '#6534ff', '#ff6ad5', '#fff4b8'], 2, 5),
  spiral: paletteConfig(['#090407', '#45f2a8', '#ff6a5f', '#ffe184'], 2, 5),
  swirl: paletteConfig(['#17120d', '#f25f5c', '#70c1b3', '#ffe066'], 2, 6),
  waves: paletteConfig(['#070509', '#5033a6', '#d5bcff'], 2, 5),
  glowingWave: paletteConfig(['#05030a', '#79f7ff', '#fff8c9'], 2, 5),
  neuroNoise: paletteConfig(['#05030a', '#6c4dff', '#2ef0c5', '#fff1c9'], 2, 6),
  perlin: paletteConfig(['#151a20', '#6f8793', '#e7e3d4'], 2, 6),
  simplexNoise: paletteConfig(['#151a20', '#45f2a8', '#fff1c9'], 2, 6),
  voronoi: paletteConfig(['#05030a', '#8d5cff', '#79e3c5'], 2, 5),
  borderRings: paletteConfig(['#05030a', '#f7e6ff', '#ff6ab7'], 2, 5),
  metaballs: paletteConfig(['#05030a', '#50e3c2', '#fff4b8'], 2, 5),
  colorPanels: paletteConfig(['#172018', '#506640', '#c8c59a', '#f2e6be'], 2, 8),
  smokeRing: paletteConfig(['#090407', '#6534ff', '#d5bcff'], 2, 5),
  noiseField: paletteConfig(['#151a20', '#6f8793', '#e7e3d4', '#b68a62'], 2, 6),
  marble: paletteConfig(WARM_TEXTURE, 2, 6),
  liquid: paletteConfig(['#05030a', '#45f2a8', '#ff6ad5', '#fff4b8'], 2, 6),
  customSpec: paletteConfig(DEFAULT_SHADER_PALETTE, 2, 4, false),
  customCode: paletteConfig(DEFAULT_SHADER_PALETTE, 2, 4, false),
};

export function shaderPaletteConfig(shaderKind: string): ShaderPaletteConfig {
  return SHADER_PALETTE_CONFIGS[shaderKind] ?? paletteConfig(DEFAULT_SHADER_PALETTE, 2, 8);
}

export function defaultShaderPalette(shaderKind: string): string[] {
  const config = shaderPaletteConfig(shaderKind);
  return config.defaults.slice(0, config.defaultCount);
}

export function normalizeShaderPalette(shaderKind: string, value: unknown): string[] {
  const config = shaderPaletteConfig(shaderKind);
  const supplied = Array.isArray(value)
    ? value.map(normalizeColor).filter((color): color is string => Boolean(color))
    : [];
  const colors = supplied.length > 0 ? supplied : config.defaults.slice(0, config.defaultCount);

  while (colors.length < config.min) {
    colors.push(config.defaults[colors.length % config.defaults.length] ?? DEFAULT_SHADER_PALETTE[0]);
  }
  return colors.slice(0, config.max);
}

function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  const short = color.match(/^#([0-9a-f]{3})$/i)?.[1];
  if (short) return `#${short.replace(/./g, (character) => `${character}${character}`)}`;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function paletteConfig(defaults: readonly string[], min: number, max: number, addable = true): ShaderPaletteConfig {
  const safeDefaults = defaults.length > 0 ? [...defaults] : [...DEFAULT_SHADER_PALETTE];
  return {
    min,
    defaultCount: Math.min(max, Math.max(min, safeDefaults.length)),
    max,
    addable,
    defaults: safeDefaults,
  };
}
