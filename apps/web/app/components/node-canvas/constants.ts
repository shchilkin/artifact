import type { EffectPreset } from '../../types/config';
import { GRAPH_NODE_KINDS, GRAPH_NODE_MODELS } from '../../utils/nodeKinds';

export const NODE_W = 320;
export const NODE_H = 360;
export const THUMB_SIZE = 280;
export const EDGE_INTERCEPT_THRESHOLD = 56;
/** Fit options that center one node, shared by Edit in Nodes and the toolbar Output action. */
export const FOCUS_NODE_FIT_OPTIONS = { padding: 0.42, maxZoom: 0.95 };
export const THUMB_DEBOUNCE_MS = 120;

export const KIND_COLOR: Record<string, string> = {
  fill: 'var(--node-kind-fill)',
  image: 'var(--node-kind-image)',
  text: 'var(--node-kind-text)',
  emoji: 'var(--node-kind-emoji)',
  effect: 'var(--node-kind-effect)',
  primitive: 'var(--node-kind-primitive)',
  model: 'var(--node-kind-primitive)',
  noise: 'var(--node-kind-noise)',
  array: 'var(--node-kind-array)',
  lineField: 'var(--node-kind-array)',
  export: 'var(--node-kind-export)',
  ...Object.fromEntries(GRAPH_NODE_KINDS.map((kind) => [kind, GRAPH_NODE_MODELS[kind].look.accent])),
};

export const KIND_SYMBOL: Record<string, string> = {
  fill: '◼',
  image: '◧',
  text: 'T',
  emoji: '✦',
  effect: '⚡',
  primitive: '◍',
  model: '⬡',
  noise: '░',
  array: '▦',
  lineField: '≋',
  export: '↗',
  ...Object.fromEntries(GRAPH_NODE_KINDS.map((kind) => [kind, GRAPH_NODE_MODELS[kind].look.canvasSymbol])),
};

export const HANDLE_STYLE = {
  background: 'transparent',
  border: 'none',
  width: 44,
  height: 44,
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
export const GLITCH_PRESETS: EffectPreset[] = [
  'glitch',
  'rgbSplit',
  'ca',
  'interlace',
  'dataMosh',
  'vhsTracking',
  'badStream',
  'macroblocks',
  'detailBlocks',
  'blockSmear',
  'chromaBlocks',
  'blockDropout',
  'pixelStretch',
];
export const TEXTURE_PRESETS: EffectPreset[] = [
  'grain',
  'dotGrain',
  'scanlines',
  'matte',
  'dither',
  'emboss',
  'linocut',
];
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
  'patternRefraction',
  'kaleidoscope',
  'squeeze',
];
export const COLOR_PRESETS: EffectPreset[] = [
  'hueShift',
  'rgbSplit',
  'vignette',
  'retroResolution',
  'pixelate',
  'posterize',
  'indexedPalette',
  'gradientMap',
  'channelMixer',
  'sepia',
  'infrared',
  'solarize',
  'bleachBypass',
  'cyanotype',
  'splitTone',
];
export const RISO_PRESETS: EffectPreset[] = ['duotone', 'halftone', 'risoShift', 'overprint'];
export const GRAPHIC_PRESETS: EffectPreset[] = [
  'blur',
  'threshold',
  'edgeCrush',
  'silhouetteCrush',
  'edgeDetect',
  'bokehBlur',
  'hatching',
  'gooeyMerge',
  'gradientOverlay',
];
