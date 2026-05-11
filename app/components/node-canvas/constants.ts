import { EFFECT_PRESETS, EFFECT_PRESET_MENU_ORDER } from '../../types/config';
import type { EffectPreset } from '../../types/config';
import type { AddAction } from './types';

export const NODE_W = 160;
export const NODE_H = 194;
export const THUMB_SIZE = 136;
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
  fill:   '◼',
  image:  '◧',
  text:   'T',
  emoji:  '✦',
  effect: '⚡',
  primitive: '◍',
  noise: '░',
  array: '▦',
  merge:  '⊕',
  color:  '◐',
  export: '↗',
};

export const ADD_GROUPS = [
  { id: 'content', label: 'Content', hint: 'Visible layers', description: 'Start with layers that render directly on the cover.' },
  { id: 'source', label: 'Source', hint: 'Generated inputs', description: 'Create procedural sources before you style or combine them.' },
  { id: 'effect', label: 'Effect', hint: 'Preset treatments', description: 'Drop in focused looks, then tune them in the inspector.' },
  { id: 'util', label: 'Utility', hint: 'Combine and grade', description: 'Merge branches, shape color, and finish the output flow.' },
] as const;

export type AddGroupId = (typeof ADD_GROUPS)[number]['id'];

export const ADD_ITEMS: Array<{ label: string; description: string; symbol: string; group: AddGroupId; action: AddAction }> = [
  { label: 'Fill', symbol: '◼', description: 'Lay down a flat color field or wash.', group: 'content', action: { kind: 'layer', layerKind: 'fill' } },
  { label: 'Image', symbol: '◧', description: 'Place uploaded art, scans, or textures.', group: 'content', action: { kind: 'layer', layerKind: 'image' } },
  { label: 'Text', symbol: 'T', description: 'Set titles, credits, or typographic shapes.', group: 'content', action: { kind: 'layer', layerKind: 'text' } },
  { label: 'Emoji', symbol: '✦', description: 'Scatter repeated glyphs into the composition.', group: 'content', action: { kind: 'layer', layerKind: 'emoji' } },
  { label: 'Primitive', symbol: '◍', description: 'Render a lit 3D form as a source layer.', group: 'source', action: { kind: 'layer', layerKind: 'primitive' } },
  { label: 'Noise', symbol: '░', description: 'Generate a procedural noise texture.', group: 'source', action: { kind: 'layer', layerKind: 'noise' } },
  { label: 'Array', symbol: '▦', description: 'Repeat a source into a structured pattern.', group: 'source', action: { kind: 'layer', layerKind: 'array' } },
  ...EFFECT_PRESET_MENU_ORDER.map((preset) => ({
    label: EFFECT_PRESETS[preset].name,
    description: 'Apply a focused effect preset, then refine it.',
    symbol: EFFECT_PRESETS[preset].icon,
    group: 'effect' as const,
    action: { kind: 'effect', preset } as AddAction,
  })),
  { label: 'Merge', symbol: '⊕', description: 'Blend two branches into one result.', group: 'util', action: { kind: 'merge' } },
  { label: 'Color', symbol: '◐', description: 'Grade hue, contrast, and tonal balance.', group: 'util', action: { kind: 'color' } },
];

export const HANDLE_STYLE = {
  background: 'var(--node-handle)',
  border: '1.5px solid var(--bg)',
  width: 10, height: 10,
};

export const NODE_CANVAS_COLORS = {
  backgroundGrid: 'var(--node-grid)',
  danger: 'var(--node-danger)',
  backdrop: 'var(--node-backdrop)',
  sceneAmbient: 0xe8dccb,
  sceneFill: 0xf2eadf,
  sceneShadow: 0x080707,
} as const;

export const BLEND_OPTIONS = ['normal', 'multiply', 'screen', 'overlay', 'luminosity'] as const;

export const RAYS_PRESETS: EffectPreset[] = ['rays', 'bloom', 'filmBurn'];
export const GLITCH_PRESETS: EffectPreset[] = ['glitch', 'rgbSplit', 'interlace', 'dataMosh'];
export const TEXTURE_PRESETS: EffectPreset[] = ['grain', 'scanlines'];
export const TINT_PRESETS: EffectPreset[] = ['tint'];
export const WARP_PRESETS: EffectPreset[] = ['noiseWarp', 'morph', 'vortex', 'barrel', 'tear', 'mirror', 'warp'];
export const COLOR_PRESETS: EffectPreset[] = ['hueShift', 'rgbSplit', 'vignette', 'pixelate', 'posterize', 'color'];
export const RISO_PRESETS: EffectPreset[] = ['duotone', 'halftone', 'risoShift', 'riso'];
