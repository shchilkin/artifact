import type { EffectPreset } from '../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../../types/config';
import { NOISE_PRESET_IDS, NOISE_PRESETS } from '../../utils/noisePresets';
import type { AddAction } from './types';

export const NODE_W = 320;
export const NODE_H = 360;
export const THUMB_SIZE = 280;
export const NODE_EDITOR_W = 292;
export const EDGE_INTERCEPT_THRESHOLD = 56;
export const THUMB_DEBOUNCE_MS = 120;

export const KIND_COLOR: Record<string, string> = {
  fill: 'var(--node-kind-fill)',
  image: 'var(--node-kind-image)',
  text: 'var(--node-kind-text)',
  emoji: 'var(--node-kind-emoji)',
  effect: 'var(--node-kind-effect)',
  primitive: 'var(--node-kind-primitive)',
  noise: 'var(--node-kind-noise)',
  array: 'var(--node-kind-array)',
  merge: 'var(--node-kind-merge)',
  color: 'var(--node-kind-color)',
  export: 'var(--node-kind-export)',
};

export const KIND_SYMBOL: Record<string, string> = {
  fill: '◼',
  image: '◧',
  text: 'T',
  emoji: '✦',
  effect: '⚡',
  primitive: '◍',
  noise: '░',
  array: '▦',
  merge: '⊕',
  color: '◐',
  export: '↗',
};

export const ADD_GROUPS = [
  {
    id: 'content',
    label: 'Content',
    hint: 'Visible layers',
    description: 'Start with layers that render directly on the cover.',
  },
  {
    id: 'source',
    label: 'Source',
    hint: 'Generated inputs',
    description: 'Create procedural sources before you style or combine them.',
  },
  {
    id: 'effect',
    label: 'Effect',
    hint: 'Preset treatments',
    description: 'Drop in focused looks, then tune them in the inspector.',
  },
  {
    id: 'util',
    label: 'Utility',
    hint: 'Combine and grade',
    description: 'Merge branches, shape color, and finish the output flow.',
  },
] as const;

export type AddGroupId = (typeof ADD_GROUPS)[number]['id'];

export const ADD_ITEMS: Array<{
  label: string;
  description: string;
  symbol: string;
  group: AddGroupId;
  action: AddAction;
}> = [
  {
    label: 'Fill',
    symbol: '◼',
    description: 'Lay down a flat color field or wash.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'fill' },
  },
  {
    label: 'Image',
    symbol: '◧',
    description: 'Place uploaded art, scans, or textures.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'image' },
  },
  {
    label: 'Text',
    symbol: 'T',
    description: 'Set titles, credits, or typographic shapes.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'text' },
  },
  {
    label: 'Emoji',
    symbol: '✦',
    description: 'Scatter repeated glyphs into the composition.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'emoji' },
  },
  {
    label: 'Primitive',
    symbol: '◍',
    description: 'Render a lit 3D form as a source layer.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'primitive' },
  },
  {
    label: 'Noise',
    symbol: '░',
    description: 'Generate a procedural noise texture from scratch.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'noise' },
  },
  ...NOISE_PRESET_IDS.map((preset) => ({
    label: NOISE_PRESETS[preset].name,
    symbol: '░',
    description: NOISE_PRESETS[preset].description,
    group: 'source' as const,
    action: { kind: 'noisePreset', preset } as AddAction,
  })),
  {
    label: 'Array',
    symbol: '▦',
    description: 'Repeat a source into a structured pattern.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'array' },
  },
  ...EFFECT_PRESET_MENU_ORDER.map((preset) => ({
    label: EFFECT_PRESETS[preset].name,
    description: 'Apply a focused effect preset, then refine it.',
    symbol: EFFECT_PRESETS[preset].icon,
    group: 'effect' as const,
    action: { kind: 'effect', preset } as AddAction,
  })),
  {
    label: 'Merge',
    symbol: '⊕',
    description: 'Blend two branches into one result.',
    group: 'util',
    action: { kind: 'merge' },
  },
  {
    label: 'Color',
    symbol: '◐',
    description: 'Grade hue, contrast, and tonal balance.',
    group: 'util',
    action: { kind: 'color' },
  },
];

export const ADD_MENU_BROWSE_MODES = [
  { id: 'nodes', label: 'Nodes', hint: 'Layers, generators, utilities' },
  { id: 'effects', label: 'Effects', hint: 'Preset looks and treatments' },
] as const;

export const ADD_NODE_GROUPS = [
  { id: 'layers', label: 'Layers', description: 'Direct artwork, text, and decorative content.' },
  { id: 'generators', label: 'Generators', description: 'Build source material procedurally before styling it.' },
  { id: 'utilities', label: 'Utilities', description: 'Combine branches and shape the final output.' },
] as const;

export type AddNodeGroupId = (typeof ADD_NODE_GROUPS)[number]['id'];

export const ADD_NODE_ITEMS: Array<{
  label: string;
  description: string;
  symbol: string;
  group: AddNodeGroupId;
  action: AddAction;
}> = [
  {
    label: 'Fill',
    symbol: '◼',
    description: 'Lay down a flat color field or wash.',
    group: 'layers',
    action: { kind: 'layer', layerKind: 'fill' },
  },
  {
    label: 'Image',
    symbol: '◧',
    description: 'Place uploaded art, scans, or textures.',
    group: 'layers',
    action: { kind: 'layer', layerKind: 'image' },
  },
  {
    label: 'Text',
    symbol: 'T',
    description: 'Set titles, credits, or typographic shapes.',
    group: 'layers',
    action: { kind: 'layer', layerKind: 'text' },
  },
  {
    label: 'Emoji',
    symbol: '✦',
    description: 'Scatter repeated glyphs into the composition.',
    group: 'layers',
    action: { kind: 'layer', layerKind: 'emoji' },
  },
  {
    label: 'Primitive',
    symbol: '◍',
    description: 'Render a lit 3D form as a source layer.',
    group: 'generators',
    action: { kind: 'layer', layerKind: 'primitive' },
  },
  {
    label: 'Noise',
    symbol: '░',
    description: 'Generate a procedural noise texture from scratch.',
    group: 'generators',
    action: { kind: 'layer', layerKind: 'noise' },
  },
  ...NOISE_PRESET_IDS.map((preset) => ({
    label: NOISE_PRESETS[preset].name,
    symbol: '░',
    description: NOISE_PRESETS[preset].description,
    group: 'generators' as const,
    action: { kind: 'noisePreset', preset } as AddAction,
  })),
  {
    label: 'Array',
    symbol: '▦',
    description: 'Repeat a source into a structured pattern.',
    group: 'generators',
    action: { kind: 'layer', layerKind: 'array' },
  },
  {
    label: 'Merge',
    symbol: '⊕',
    description: 'Blend two branches into one result.',
    group: 'utilities',
    action: { kind: 'merge' },
  },
  {
    label: 'Color',
    symbol: '◐',
    description: 'Grade hue, contrast, and tonal balance.',
    group: 'utilities',
    action: { kind: 'color' },
  },
];

export const ADD_EFFECT_FAMILIES = [
  {
    id: 'light',
    label: 'Light',
    hint: 'Glow, burn, haze, speed',
    description: 'Atmosphere, bloom, and energy treatments.',
    presets: ['rays', 'bloom', 'filmBurn', 'neonGlow', 'fog', 'speedLines'] as EffectPreset[],
  },
  {
    id: 'signal',
    label: 'Signal',
    hint: 'Glitch, split, tracking',
    description: 'Artifacts, channel breaks, and analog interference.',
    presets: ['glitch', 'rgbSplit', 'ca', 'interlace', 'dataMosh', 'vhsTracking'] as EffectPreset[],
  },
  {
    id: 'texture',
    label: 'Texture',
    hint: 'Grain, scan, dither, print',
    description: 'Surface noise, print feel, and tactile detail.',
    presets: ['grain', 'scanlines', 'matte', 'dither', 'emboss', 'linocut'] as EffectPreset[],
  },
  {
    id: 'warp',
    label: 'Warp',
    hint: 'Distort, bend, ripple',
    description: 'Motion, lens warps, and spatial distortion.',
    presets: [
      'noiseWarp',
      'morph',
      'vortex',
      'barrel',
      'tear',
      'mirror',
      'wave',
      'zoomBlur',
      'ripple',
      'kaleidoscope',
      'squeeze',
    ] as EffectPreset[],
  },
  {
    id: 'tone',
    label: 'Tone',
    hint: 'Tint, grade, shift, bleach',
    description: 'Color grading, film looks, and tonal remapping.',
    presets: [
      'tint',
      'hueShift',
      'vignette',
      'pixelate',
      'posterize',
      'sepia',
      'infrared',
      'solarize',
      'bleachBypass',
      'cyanotype',
      'splitTone',
    ] as EffectPreset[],
  },
  {
    id: 'graphic',
    label: 'Graphic',
    hint: 'Duotone, threshold, edges',
    description: 'Bold graphic reduction and stylized finishing passes.',
    presets: [
      'duotone',
      'halftone',
      'risoShift',
      'overprint',
      'blur',
      'threshold',
      'edgeDetect',
      'gradientOverlay',
    ] as EffectPreset[],
  },
] as const;

export type AddEffectFamilyId = (typeof ADD_EFFECT_FAMILIES)[number]['id'];

export const ADD_EFFECT_ITEMS: Array<{
  label: string;
  description: string;
  symbol: string;
  family: AddEffectFamilyId;
  action: AddAction;
}> = EFFECT_PRESET_MENU_ORDER.map((preset) => {
  const family = ADD_EFFECT_FAMILIES.find((entry) => entry.presets.includes(preset)) ?? ADD_EFFECT_FAMILIES[0];
  return {
    label: EFFECT_PRESETS[preset].name,
    description: family.hint,
    symbol: EFFECT_PRESETS[preset].icon,
    family: family.id,
    action: { kind: 'effect', preset } as AddAction,
  };
});

export const HANDLE_STYLE = {
  background: 'var(--node-handle)',
  border: '1.5px solid var(--bg)',
  width: 10,
  height: 10,
};

export const NODE_CANVAS_COLORS = {
  backgroundGrid: 'var(--node-grid)',
  danger: 'var(--node-danger)',
  backdrop: 'var(--node-backdrop)',
  sceneAmbient: 0xe8dccb,
  sceneFill: 0xf2eadf,
  sceneShadow: 0x080707,
} as const;

// Re-exported from canonical source — do not redefine here.
export { BLEND_OPTIONS } from '../../components/layer-controls/fieldDefs';

export const RAYS_PRESETS: EffectPreset[] = ['rays', 'bloom', 'filmBurn', 'neonGlow', 'fog', 'speedLines'];
export const GLITCH_PRESETS: EffectPreset[] = ['glitch', 'rgbSplit', 'ca', 'interlace', 'dataMosh', 'vhsTracking'];
export const TEXTURE_PRESETS: EffectPreset[] = ['grain', 'scanlines', 'matte', 'dither', 'emboss', 'linocut'];
export const TINT_PRESETS: EffectPreset[] = ['tint'];
export const WARP_PRESETS: EffectPreset[] = [
  'noiseWarp',
  'morph',
  'vortex',
  'barrel',
  'tear',
  'mirror',
  'wave',
  'zoomBlur',
  'ripple',
  'kaleidoscope',
  'squeeze',
];
export const COLOR_PRESETS: EffectPreset[] = [
  'hueShift',
  'rgbSplit',
  'vignette',
  'pixelate',
  'posterize',
  'sepia',
  'infrared',
  'solarize',
  'bleachBypass',
  'cyanotype',
  'splitTone',
];
export const RISO_PRESETS: EffectPreset[] = ['duotone', 'halftone', 'risoShift', 'overprint'];
export const GRAPHIC_PRESETS: EffectPreset[] = ['blur', 'threshold', 'edgeDetect', 'gradientOverlay'];
