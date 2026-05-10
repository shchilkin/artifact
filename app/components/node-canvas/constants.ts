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

export const ADD_ITEMS: Array<{ label: string; symbol: string; group: string; action: AddAction }> = [
  { label: 'Fill',    symbol: '◼', group: 'content', action: { kind: 'layer', layerKind: 'fill' } },
  { label: 'Image',   symbol: '◧', group: 'content', action: { kind: 'layer', layerKind: 'image' } },
  { label: 'Text',    symbol: 'T', group: 'content', action: { kind: 'layer', layerKind: 'text' } },
  { label: 'Emoji',   symbol: '✦', group: 'content', action: { kind: 'layer', layerKind: 'emoji' } },
  { label: 'Primitive', symbol: '◍', group: 'source', action: { kind: 'layer', layerKind: 'primitive' } },
  { label: 'Noise',     symbol: '░', group: 'source', action: { kind: 'layer', layerKind: 'noise' } },
  { label: 'Array',     symbol: '▦', group: 'source', action: { kind: 'layer', layerKind: 'array' } },
  ...EFFECT_PRESET_MENU_ORDER.map((preset) => ({
    label: EFFECT_PRESETS[preset].name,
    symbol: EFFECT_PRESETS[preset].icon,
    group: 'effect',
    action: { kind: 'effect', preset } as AddAction,
  })),
  { label: 'Merge',   symbol: '⊕', group: 'util',   action: { kind: 'merge' } },
  { label: 'Color',   symbol: '◐', group: 'util',   action: { kind: 'color' } },
];

export const HANDLE_STYLE = {
  background: 'oklch(74% 0.17 152)',
  border: '1.5px solid var(--bg)',
  width: 10, height: 10,
};

export const BLEND_OPTIONS = ['normal', 'multiply', 'screen', 'overlay', 'luminosity'] as const;

export const RAYS_PRESETS: EffectPreset[] = ['rays', 'bloom', 'filmBurn'];
export const GLITCH_PRESETS: EffectPreset[] = ['glitch', 'rgbSplit', 'interlace', 'dataMosh'];
export const TEXTURE_PRESETS: EffectPreset[] = ['grain', 'scanlines'];
export const TINT_PRESETS: EffectPreset[] = ['tint'];
export const WARP_PRESETS: EffectPreset[] = ['noiseWarp', 'morph', 'vortex', 'barrel', 'tear', 'mirror', 'warp'];
export const COLOR_PRESETS: EffectPreset[] = ['hueShift', 'rgbSplit', 'vignette', 'pixelate', 'posterize', 'color'];
export const RISO_PRESETS: EffectPreset[] = ['duotone', 'halftone', 'risoShift', 'riso'];
