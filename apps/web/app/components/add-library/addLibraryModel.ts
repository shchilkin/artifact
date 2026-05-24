import type { EffectPreset, LayerKind } from '../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../../types/config';
import { ARRAY_PRESET_IDS, ARRAY_PRESETS, type ArrayPresetId } from '../../utils/arrayPresets';
import { NOISE_PRESET_IDS, NOISE_PRESETS, type NoisePresetId } from '../../utils/noisePresets';
import { REPEAT_PRESET_IDS, REPEAT_PRESETS, type RepeatPresetId } from '../../utils/repeatPresets';

export type AddLibrarySurface = 'layers' | 'nodes';

export type AddLibraryAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'aiImage' }
  | { kind: 'noisePreset'; preset: NoisePresetId }
  | { kind: 'arrayPreset'; preset: ArrayPresetId }
  | { kind: 'effect'; preset: EffectPreset }
  | { kind: 'merge' }
  | { kind: 'color' }
  | { kind: 'repeat' }
  | { kind: 'repeatPreset'; preset: RepeatPresetId };

export type AddLibraryGroupId =
  | 'content'
  | 'source'
  | 'light'
  | 'signal'
  | 'texture'
  | 'warp'
  | 'tone'
  | 'print'
  | 'graphic'
  | 'utility';

export type AddLibraryItem = {
  id: string;
  label: string;
  description: string;
  symbol: string;
  group: AddLibraryGroupId;
  action: AddLibraryAction;
  surfaces: readonly AddLibrarySurface[];
  keywords?: string;
  popular?: boolean;
};

export const ADD_LIBRARY_ACTION_MIME = 'application/x-artifact-add-library-action';

export type AddLibraryRecipe = {
  id: string;
  label: string;
  hint: string;
  itemIds: readonly string[];
  surfaces: readonly AddLibrarySurface[];
};

export const ADD_LIBRARY_GROUPS: Array<{
  id: AddLibraryGroupId;
  label: string;
  hint: string;
}> = [
  { id: 'content', label: 'Content', hint: 'Visible layers' },
  { id: 'source', label: 'Source', hint: 'Generated inputs' },
  { id: 'texture', label: 'Texture', hint: 'Grain, scan, paper' },
  { id: 'light', label: 'Light', hint: 'Glow, burn, haze' },
  { id: 'signal', label: 'Signal', hint: 'Glitch, split, tracking' },
  { id: 'warp', label: 'Warp', hint: 'Distort, bend, ripple' },
  { id: 'tone', label: 'Tone', hint: 'Grade, shift, low-res' },
  { id: 'print', label: 'Print', hint: 'Ink, dots, registration' },
  { id: 'graphic', label: 'Graphic', hint: 'Cutoff, edges, blur' },
  { id: 'utility', label: 'Utility', hint: 'Graph helpers' },
];

const EFFECT_FAMILIES: Array<{
  group: Extract<AddLibraryGroupId, 'light' | 'signal' | 'texture' | 'warp' | 'tone' | 'print' | 'graphic'>;
  description: string;
  presets: readonly EffectPreset[];
}> = [
  {
    group: 'light',
    description: 'Atmosphere, bloom, flare, and energy treatments.',
    presets: ['rays', 'bloom', 'filmBurn', 'neonGlow', 'fog', 'speedLines'],
  },
  {
    group: 'signal',
    description: 'Artifacts, channel breaks, and analog interference.',
    presets: ['glitch', 'rgbSplit', 'ca', 'interlace', 'dataMosh', 'vhsTracking'],
  },
  {
    group: 'texture',
    description: 'Surface noise, print feel, and tactile detail.',
    presets: ['grain', 'scanlines', 'matte', 'dither', 'emboss', 'linocut'],
  },
  {
    group: 'warp',
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
    ],
  },
  {
    group: 'tone',
    description: 'Color grading, film looks, and low-resolution remapping.',
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
    ],
  },
  {
    group: 'print',
    description: 'Ink, halftone dots, overprint, and registration shifts.',
    presets: ['duotone', 'halftone', 'risoShift', 'overprint'],
  },
  {
    group: 'graphic',
    description: 'Bold reductions, linework, blur, and gradient finishing.',
    presets: ['blur', 'threshold', 'edgeDetect', 'gradientOverlay'],
  },
];

const EFFECT_KEYWORDS: Partial<Record<EffectPreset, string>> = {
  duotone: 'photo tone color image recipe',
  grain: 'paper dust texture print finish popular',
  scanlines: 'crt print line signal texture',
  risoShift: 'registration misregister print sticker grid popular',
  overprint: 'ink pressure print sticker',
  cyanotype: 'blue image wash primitive',
  neonGlow: 'glow halo primitive light',
  vignette: 'frame falloff focus image',
  halftone: 'print dots poster damage',
  tear: 'rip paper damage glitch',
  threshold: 'black white damage print cutoff',
  pixelate: 'pixel block low-res low resolution mosaic popular',
  dither: 'pixel pattern bayer print texture popular',
};

const KIND_SYMBOL: Record<Exclude<LayerKind, 'effect'>, string> = {
  text: 'T',
  image: '◧',
  emoji: '✦',
  fill: '◼',
  primitive: '◍',
  noise: '░',
  array: '▦',
};

const layerItems: AddLibraryItem[] = [
  {
    id: 'layer:fill',
    label: 'Fill',
    symbol: KIND_SYMBOL.fill,
    description: 'Lay down a flat color field or wash.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'fill' },
    surfaces: ['layers', 'nodes'],
    keywords: 'background base plate color wash poster photo type texture recipe',
    popular: true,
  },
  {
    id: 'layer:image',
    label: 'Image',
    symbol: KIND_SYMBOL.image,
    description: 'Place uploaded art, scans, or textures.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'image' },
    surfaces: ['layers', 'nodes'],
    keywords: 'photo picture cover upload scan artwork type recipe',
    popular: true,
  },
  {
    id: 'layer:text',
    label: 'Text',
    symbol: KIND_SYMBOL.text,
    description: 'Set titles, credits, or typographic shapes.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'text' },
    surfaces: ['layers', 'nodes'],
    keywords: 'photo type title headline typography caption label recipe',
    popular: true,
  },
  {
    id: 'layer:emoji',
    label: 'Emoji',
    symbol: KIND_SYMBOL.emoji,
    description: 'Scatter repeated glyphs into the composition.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'emoji' },
    surfaces: ['layers', 'nodes'],
    keywords: 'glyph scatter symbol icon sticker',
  },
  {
    id: 'aiImage',
    label: 'AI Image',
    symbol: KIND_SYMBOL.image,
    description: 'Generate a private alpha image asset, then pipe it through the graph.',
    group: 'source',
    action: { kind: 'aiImage' },
    surfaces: ['nodes'],
    keywords: 'ai image generate generation prompt openai xai account asset source photo',
  },
  {
    id: 'layer:primitive',
    label: 'Primitive',
    symbol: KIND_SYMBOL.primitive,
    description: 'Render a lit 3D form as a source layer.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'primitive' },
    surfaces: ['layers', 'nodes'],
    keywords: '3d object shape cylinder sphere cube image branch',
  },
  {
    id: 'layer:noise',
    label: 'Noise',
    symbol: KIND_SYMBOL.noise,
    description: 'Generate a procedural noise texture from scratch.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'noise' },
    surfaces: ['layers', 'nodes'],
    keywords: 'texture paper grain static concrete source',
  },
  {
    id: 'layer:array',
    label: 'Array',
    symbol: KIND_SYMBOL.array,
    description: 'Repeat a source into a structured pattern.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'array' },
    surfaces: ['layers', 'nodes'],
    keywords: 'motif sticker grid pattern repeated marks',
  },
];

const sourcePresetItems: AddLibraryItem[] = [
  ...NOISE_PRESET_IDS.map((preset) => ({
    id: `noisePreset:${preset}`,
    label: NOISE_PRESETS[preset].name,
    symbol: KIND_SYMBOL.noise,
    description: NOISE_PRESETS[preset].description,
    group: 'source' as const,
    action: { kind: 'noisePreset', preset } as AddLibraryAction,
    surfaces: ['nodes'] as const,
    keywords: 'texture paper grain static source recipe',
  })),
  ...ARRAY_PRESET_IDS.map((preset) => ({
    id: `arrayPreset:${preset}`,
    label: ARRAY_PRESETS[preset].name,
    symbol: KIND_SYMBOL.array,
    description: ARRAY_PRESETS[preset].description,
    group: 'source' as const,
    action: { kind: 'arrayPreset', preset } as AddLibraryAction,
    surfaces: ['nodes'] as const,
    keywords: 'motif sticker grid orbit shard pattern recipe',
  })),
];

const effectItems: AddLibraryItem[] = EFFECT_PRESET_MENU_ORDER.map((preset) => {
  const family = EFFECT_FAMILIES.find((entry) => entry.presets.includes(preset)) ?? EFFECT_FAMILIES[0];
  const meta = EFFECT_PRESETS[preset];
  return {
    id: `effect:${preset}`,
    label: meta.name,
    description: family.description,
    symbol: meta.icon,
    group: family.group,
    action: { kind: 'effect', preset },
    surfaces: ['layers', 'nodes'],
    keywords: EFFECT_KEYWORDS[preset],
    popular: ['grain', 'pixelate', 'dither', 'risoShift'].includes(preset),
  };
});

const utilityItems: AddLibraryItem[] = [
  {
    id: 'merge',
    label: 'Merge',
    symbol: '⊕',
    description: 'Blend two branches into one result.',
    group: 'utility',
    action: { kind: 'merge' },
    surfaces: ['nodes'],
    keywords: 'blend combine branches graph recipe',
  },
  {
    id: 'color',
    label: 'Color',
    symbol: '◐',
    description: 'Grade hue, contrast, and tonal balance.',
    group: 'utility',
    action: { kind: 'color' },
    surfaces: ['nodes'],
    keywords: 'grade tone contrast saturation hue',
  },
  {
    id: 'repeat',
    label: 'Repeater',
    symbol: '⧉',
    description: 'Repeat any source branch into line, grid, or radial patterns.',
    group: 'utility',
    action: { kind: 'repeat' },
    surfaces: ['nodes'],
    keywords: 'repeat motif grid line radial branch',
  },
  ...REPEAT_PRESET_IDS.map((preset) => ({
    id: `repeatPreset:${preset}`,
    label: REPEAT_PRESETS[preset].name,
    symbol: '⧉',
    description: REPEAT_PRESETS[preset].description,
    group: 'utility' as const,
    action: { kind: 'repeatPreset', preset } as AddLibraryAction,
    surfaces: ['nodes'] as const,
    keywords: 'motif sticker grid echo orbit repeat recipe',
  })),
];

export const ADD_LIBRARY_ITEMS: AddLibraryItem[] = [
  ...layerItems,
  ...sourcePresetItems,
  ...effectItems,
  ...utilityItems,
];

export const ADD_LIBRARY_RECIPES: AddLibraryRecipe[] = [
  {
    id: 'photo-type',
    label: 'Photo + Type',
    hint: 'image / duotone / title / grain',
    surfaces: ['nodes'],
    itemIds: ['layer:fill', 'layer:image', 'effect:duotone', 'layer:text', 'effect:grain'],
  },
  {
    id: 'texture-type',
    label: 'Texture Type',
    hint: 'noise / title / print finish',
    surfaces: ['nodes'],
    itemIds: [
      'layer:fill',
      'layer:noise',
      'noisePreset:paper',
      'layer:text',
      'effect:risoShift',
      'effect:scanlines',
      'effect:grain',
    ],
  },
  {
    id: 'sticker-grid',
    label: 'Sticker Grid',
    hint: 'paper / array / registration',
    surfaces: ['nodes'],
    itemIds: [
      'noisePreset:paper',
      'arrayPreset:stickerGrid',
      'repeatPreset:stickerGrid',
      'effect:risoShift',
      'layer:text',
      'effect:overprint',
    ],
  },
  {
    id: 'primitive-image',
    label: 'Primitive + Image',
    hint: 'object branch / image branch / merge',
    surfaces: ['nodes'],
    itemIds: [
      'layer:image',
      'layer:primitive',
      'effect:cyanotype',
      'effect:neonGlow',
      'merge',
      'layer:text',
      'effect:vignette',
    ],
  },
  {
    id: 'print-damage',
    label: 'Print Damage',
    hint: 'paper / halftone / tear / dust',
    surfaces: ['nodes'],
    itemIds: ['noisePreset:paper', 'layer:text', 'effect:halftone', 'effect:tear', 'effect:grain', 'effect:threshold'],
  },
];

export function addLibraryItemsForSurface(surface: AddLibrarySurface) {
  return ADD_LIBRARY_ITEMS.filter((item) => item.surfaces.includes(surface));
}

export function addLibraryRecipesForSurface(surface: AddLibrarySurface) {
  return ADD_LIBRARY_RECIPES.filter((recipe) => recipe.surfaces.includes(surface));
}

export function addLibraryGroupsForSurface(surface: AddLibrarySurface) {
  const groupIds = new Set(addLibraryItemsForSurface(surface).map((item) => item.group));
  return ADD_LIBRARY_GROUPS.filter((group) => groupIds.has(group.id));
}

export function serializeAddLibraryAction(action: AddLibraryAction) {
  return JSON.stringify(action);
}

export function parseAddLibraryAction(value: string): AddLibraryAction | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isAddLibraryAction(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isAddLibraryAction(value: unknown): value is AddLibraryAction {
  if (!value || typeof value !== 'object' || !('kind' in value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'aiImage' || value.kind === 'merge' || value.kind === 'color' || value.kind === 'repeat') {
    return true;
  }
  if (value.kind === 'layer') {
    return 'layerKind' in value && isLayerAddKind(value.layerKind);
  }
  if (value.kind === 'effect') {
    return 'preset' in value && isEffectPreset(value.preset);
  }
  if (value.kind === 'noisePreset') {
    return (
      'preset' in value && typeof value.preset === 'string' && NOISE_PRESET_IDS.includes(value.preset as NoisePresetId)
    );
  }
  if (value.kind === 'arrayPreset') {
    return (
      'preset' in value && typeof value.preset === 'string' && ARRAY_PRESET_IDS.includes(value.preset as ArrayPresetId)
    );
  }
  if (value.kind === 'repeatPreset') {
    return (
      'preset' in value &&
      typeof value.preset === 'string' &&
      REPEAT_PRESET_IDS.includes(value.preset as RepeatPresetId)
    );
  }
  return false;
}

function isLayerAddKind(value: unknown): value is Exclude<LayerKind, 'effect'> {
  return (
    value === 'text' ||
    value === 'image' ||
    value === 'emoji' ||
    value === 'fill' ||
    value === 'primitive' ||
    value === 'noise' ||
    value === 'array'
  );
}

function isEffectPreset(value: unknown): value is EffectPreset {
  return typeof value === 'string' && EFFECT_PRESET_MENU_ORDER.includes(value as EffectPreset);
}
