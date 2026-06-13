import type { EffectPreset } from '../../types/config';
import type { AddAction } from '../../utils/addActions';
import { ARRAY_PRESET_IDS, ARRAY_PRESETS } from '../../utils/arrayPresets';
import { NOISE_PRESET_IDS, NOISE_PRESETS } from '../../utils/noisePresets';
import { REPEAT_PRESET_IDS, REPEAT_PRESETS } from '../../utils/repeatPresets';

export const NODE_W = 320;
export const NODE_H = 360;
export const THUMB_SIZE = 280;
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
  lineField: 'var(--node-kind-array)',
  merge: 'var(--node-kind-merge)',
  color: 'var(--node-kind-color)',
  repeat: 'var(--node-kind-array)',
  mask: 'var(--node-kind-effect)',
  transform: 'var(--node-kind-color)',
  grimeShadow: 'var(--node-kind-effect)',
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
  lineField: '≋',
  merge: '⊕',
  color: '◐',
  repeat: '⧉',
  mask: '◒',
  transform: '↻',
  grimeShadow: '◖',
  export: '↗',
};

export type AddNodeGroupId = 'layers' | 'generators' | 'utilities';

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
    label: 'AI Image',
    symbol: '◧',
    description: 'Generate a private alpha image asset, then pipe it through the graph.',
    group: 'generators',
    action: { kind: 'aiImage' },
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
  ...ARRAY_PRESET_IDS.map((preset) => ({
    label: ARRAY_PRESETS[preset].name,
    symbol: '▦',
    description: ARRAY_PRESETS[preset].description,
    group: 'generators' as const,
    action: { kind: 'arrayPreset', preset } as AddAction,
  })),
  {
    label: 'Line Field',
    symbol: '≋',
    description: 'Draw editable optical, contour, and warped line fields.',
    group: 'generators',
    action: { kind: 'layer', layerKind: 'lineField' },
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
  {
    label: 'Mask',
    symbol: '◒',
    description: 'Cut a source branch by alpha or brightness from another branch.',
    group: 'utilities',
    action: { kind: 'mask' },
  },
  {
    label: 'Transform',
    symbol: '↻',
    description: 'Move, scale, rotate, and fade a completed upstream branch.',
    group: 'utilities',
    action: { kind: 'transform' },
  },
  {
    label: 'Grime Shadow',
    symbol: '◖',
    description: 'Build a layered dirty shadow from an upstream alpha shape.',
    group: 'utilities',
    action: { kind: 'grimeShadow' },
  },
  {
    label: 'Repeater',
    symbol: '⧉',
    description: 'Repeat any source branch into line, grid, or radial patterns.',
    group: 'utilities',
    action: { kind: 'repeat' },
  },
  ...REPEAT_PRESET_IDS.map((preset) => ({
    label: REPEAT_PRESETS[preset].name,
    symbol: '⧉',
    description: REPEAT_PRESETS[preset].description,
    group: 'utilities' as const,
    action: { kind: 'repeatPreset', preset } as AddAction,
  })),
];

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
