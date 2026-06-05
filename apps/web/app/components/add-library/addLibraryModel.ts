import type { EffectPreset, LayerKind } from '../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../../types/config';
import type { AddAction } from '../../utils/addActions';
import { ARRAY_PRESET_IDS, ARRAY_PRESETS, type ArrayPresetId } from '../../utils/arrayPresets';
import { NOISE_PRESET_IDS, NOISE_PRESETS, type NoisePresetId } from '../../utils/noisePresets';
import { REPEAT_PRESET_IDS, REPEAT_PRESETS, type RepeatPresetId } from '../../utils/repeatPresets';
import { TEXT_PRESET_IDS, TEXT_PRESETS, type TextPresetId } from '../../utils/textPresets';

export type AddLibrarySurface = 'layers' | 'nodes';

export type AddLibraryAction = AddAction;

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
  tags?: readonly string[];
  keywords?: string;
  popular?: boolean;
  showInBrowse?: boolean;
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
  duotone: 'photo tone color image recipe two color poster old photo',
  grain: 'paper dust texture print finish popular old photo noisy film',
  scanlines: 'crt print line signal texture tv monitor old screen',
  risoShift: 'registration misregister print sticker grid popular',
  overprint: 'ink pressure print sticker',
  cyanotype: 'blue image wash primitive',
  neonGlow: 'glow halo primitive light',
  vignette: 'frame falloff focus image',
  halftone: 'print dots poster damage',
  tear: 'rip paper damage glitch',
  threshold: 'black white damage print cutoff',
  pixelate: 'pixel block low-res low resolution low res mosaic popular',
  dither: 'pixel pattern bayer print texture popular',
};

const EFFECT_DESCRIPTIONS: Partial<Record<EffectPreset, string>> = {
  grain: 'Fine surface noise for paper, dust, and old-photo finish.',
  dither: 'Bayer-style pixel texture for crunchy low-color poster output.',
  pixelate: 'Whole-image block size for low-resolution cover treatments.',
  splitTone: 'Push shadows and highlights into two controlled color casts.',
  halftone: 'Screen-print dots for poster texture and print damage.',
  risoShift: 'Ink misregistration for risograph-style color drift.',
  scanlines: 'CRT-style horizontal bands for monitor and video texture.',
  tear: 'Ripped spatial offset for damaged paper and broken motion.',
  kaleidoscope: 'Radial mirrored repetition from the center of the image.',
  neonGlow: 'Hot colored bloom around bright pixels and synthetic light.',
};

const EFFECT_TAGS: Partial<Record<EffectPreset, readonly string[]>> = {
  rays: ['light', 'poster'],
  bloom: ['light', 'photo'],
  filmBurn: ['light', 'photo'],
  neonGlow: ['light', 'glow'],
  fog: ['light', 'haze'],
  speedLines: ['motion', 'graphic'],
  glitch: ['signal', 'damage'],
  rgbSplit: ['signal', 'color'],
  ca: ['signal', 'photo'],
  interlace: ['signal', 'crt'],
  dataMosh: ['signal', 'damage'],
  vhsTracking: ['signal', 'crt'],
  grain: ['texture', 'paper', 'photo'],
  scanlines: ['texture', 'crt'],
  matte: ['texture', 'paper'],
  dither: ['texture', 'low-res'],
  emboss: ['texture', 'relief'],
  linocut: ['texture', 'print'],
  noiseWarp: ['warp', 'liquid'],
  morph: ['warp', 'motion'],
  vortex: ['warp', 'spin'],
  barrel: ['warp', 'lens'],
  tear: ['warp', 'damage'],
  mirror: ['warp', 'repeat'],
  wave: ['warp', 'motion'],
  zoomBlur: ['warp', 'motion'],
  ripple: ['warp', 'liquid'],
  kaleidoscope: ['warp', 'repeat'],
  squeeze: ['warp', 'stretch'],
  tint: ['tone', 'color'],
  hueShift: ['tone', 'color'],
  vignette: ['tone', 'photo'],
  pixelate: ['tone', 'low-res'],
  posterize: ['tone', 'steps'],
  sepia: ['tone', 'photo'],
  infrared: ['tone', 'photo'],
  solarize: ['tone', 'photo'],
  bleachBypass: ['tone', 'photo'],
  cyanotype: ['tone', 'blue'],
  splitTone: ['tone', 'photo'],
  duotone: ['print', 'photo'],
  halftone: ['print', 'dots'],
  risoShift: ['print', 'register'],
  overprint: ['print', 'ink'],
  blur: ['graphic', 'soft'],
  threshold: ['graphic', 'cutoff'],
  edgeDetect: ['graphic', 'line'],
  gradientOverlay: ['graphic', 'wash'],
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
    tags: ['base', 'color'],
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
    tags: ['photo', 'source'],
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
    tags: ['type', 'title'],
    keywords: 'photo type title headline typography caption label recipe',
    popular: true,
  },
  ...TEXT_PRESET_IDS.map((preset) => ({
    id: `textPreset:${preset}`,
    label: TEXT_PRESETS[preset].name,
    symbol: KIND_SYMBOL.text,
    description: TEXT_PRESETS[preset].description,
    group: 'content' as const,
    action: { kind: 'textPreset', preset } as AddLibraryAction,
    surfaces: ['layers', 'nodes'] as const,
    tags: TEXT_PRESETS[preset].tags,
    keywords: TEXT_PRESETS[preset].keywords,
    popular: TEXT_PRESETS[preset].popular,
    showInBrowse: false,
  })),
  {
    id: 'layer:emoji',
    label: 'Emoji',
    symbol: KIND_SYMBOL.emoji,
    description: 'Scatter repeated glyphs into the composition.',
    group: 'content',
    action: { kind: 'layer', layerKind: 'emoji' },
    surfaces: ['layers', 'nodes'],
    tags: ['sticker', 'glyph'],
    keywords: 'glyph scatter symbol icon sticker',
  },
  {
    id: 'aiImage',
    label: 'AI Image',
    symbol: KIND_SYMBOL.image,
    description: 'Generate a private alpha image asset, then use it like an image.',
    group: 'source',
    action: { kind: 'aiImage' },
    surfaces: ['layers', 'nodes'],
    tags: ['source', 'ai'],
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
    tags: ['source', '3d'],
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
    tags: ['source', 'texture'],
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
    tags: ['source', 'pattern'],
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
    surfaces: ['layers', 'nodes'] as const,
    tags: ['source', 'texture'],
    keywords: 'texture paper grain static source recipe',
  })),
  ...ARRAY_PRESET_IDS.map((preset) => ({
    id: `arrayPreset:${preset}`,
    label: ARRAY_PRESETS[preset].name,
    symbol: KIND_SYMBOL.array,
    description: ARRAY_PRESETS[preset].description,
    group: 'source' as const,
    action: { kind: 'arrayPreset', preset } as AddLibraryAction,
    surfaces: ['layers', 'nodes'] as const,
    tags: ['source', 'pattern'],
    keywords: 'motif sticker grid orbit shard pattern recipe',
  })),
];

const effectItems: AddLibraryItem[] = EFFECT_PRESET_MENU_ORDER.map((preset) => {
  const family = EFFECT_FAMILIES.find((entry) => entry.presets.includes(preset)) ?? EFFECT_FAMILIES[0];
  const meta = EFFECT_PRESETS[preset];
  return {
    id: `effect:${preset}`,
    label: meta.name,
    description: EFFECT_DESCRIPTIONS[preset] ?? family.description,
    symbol: meta.icon,
    group: family.group,
    action: { kind: 'effect', preset },
    surfaces: ['layers', 'nodes'],
    tags: EFFECT_TAGS[preset],
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
    tags: ['utility', 'blend'],
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
    tags: ['utility', 'tone'],
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
    tags: ['utility', 'repeat'],
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
    tags: ['utility', 'repeat'],
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
    itemIds: ['layer:fill', 'layer:image', 'effect:duotone', 'textPreset:title', 'effect:grain'],
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
      'textPreset:title',
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
      'textPreset:label',
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
      'textPreset:title',
      'effect:vignette',
    ],
  },
  {
    id: 'print-damage',
    label: 'Print Damage',
    hint: 'paper / halftone / tear / dust',
    surfaces: ['nodes'],
    itemIds: [
      'noisePreset:paper',
      'textPreset:poster',
      'effect:halftone',
      'effect:tear',
      'effect:grain',
      'effect:threshold',
    ],
  },
];

export function addLibraryItemsForSurface(surface: AddLibrarySurface) {
  return ADD_LIBRARY_ITEMS.filter((item) => item.surfaces.includes(surface));
}

export function addLibraryBrowseItemsForSurface(surface: AddLibrarySurface) {
  return addLibraryItemsForSurface(surface).filter((item) => item.showInBrowse !== false);
}

export function addLibraryRecipesForSurface(surface: AddLibrarySurface) {
  return ADD_LIBRARY_RECIPES.filter((recipe) => recipe.surfaces.includes(surface));
}

export function addLibraryGroupsForSurface(surface: AddLibrarySurface) {
  const groupIds = new Set(addLibraryItemsForSurface(surface).map((item) => item.group));
  return ADD_LIBRARY_GROUPS.filter((group) => groupIds.has(group.id));
}

export function searchAddLibraryItems(items: readonly AddLibraryItem[], query: string) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return items
    .map((item) => ({ item, score: itemSearchScore(item, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .map(({ item }) => item);
}

function itemSearchScore(item: AddLibraryItem, tokens: string[]) {
  const query = tokens.join(' ');
  const label = item.label.toLowerCase();
  const tags = item.tags?.join(' ') ?? '';
  const text = [item.label, item.description, item.symbol, item.group, item.id, tags, item.keywords]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const phraseScore = query.length > 2 && text.includes(query) ? 8 : 0;
  return tokens.reduce((score, token) => {
    if (!text.includes(token)) return score;
    if (label.startsWith(token)) return score + 5;
    if (label.includes(token)) return score + 4;
    if (item.tags?.some((tag) => tag.toLowerCase().includes(token))) return score + 3;
    return score + 1;
  }, phraseScore);
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
  if (value.kind === 'textPreset') {
    return (
      'preset' in value && typeof value.preset === 'string' && TEXT_PRESET_IDS.includes(value.preset as TextPresetId)
    );
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
