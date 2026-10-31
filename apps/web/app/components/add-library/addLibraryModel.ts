import type { EffectPreset, LayerKind } from '../../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS, LEGACY_SHADER_KINDS, SHADER_KINDS } from '../../types/config';
import { kernelOfPreset } from '../../types/effectKernels';
import { type EffectId, effectOfKernel, effectSpec, isEffectId } from '../../types/effectSchema';
import type { AddAction } from '../../utils/addActions';
import { ARRAY_PRESET_IDS, ARRAY_PRESETS } from '../../utils/arrayPresets';
import { GRAPH_NODE_KINDS, GRAPH_NODE_MODELS } from '../../utils/nodeKinds';
import { NOISE_PRESET_IDS, NOISE_PRESETS } from '../../utils/noisePresets';
import { isRecipeId, RECIPES } from '../../utils/recipes';
import { REPEAT_PRESET_IDS, REPEAT_PRESETS } from '../../utils/repeatPresets';
import { TEXT_PRESET_IDS, TEXT_PRESETS } from '../../utils/textPresets';

export type AddLibrarySurface = 'layers' | 'nodes';

export type AddLibraryAction = AddAction;

export type AddLibraryGroupId =
  | 'content'
  | 'source'
  | 'shaderFill'
  | 'shaderEffect'
  | 'material'
  | 'primitive'
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
const SIMPLE_ADD_ACTION_KINDS = new Set<string>([
  'aiImage',
  ...GRAPH_NODE_KINDS.filter((kind) => GRAPH_NODE_MODELS[kind].library.entry),
]);
const LAYER_ADD_KINDS = new Set([
  'text',
  'image',
  'emoji',
  'fill',
  'primitive',
  'noise',
  'array',
  'lineField',
  'model',
]);
const MATERIAL_PRESET_IDS = [
  'matte',
  'goldFoil',
  'chrome',
  'brushedMetal',
  'pearl',
  'plastic',
  'paper',
  'fabric',
] as const;

/** A recipe in the Recipes view: one item that inserts a wired group of nodes. */
export type AddLibraryRecipe = {
  id: string;
  label: string;
  hint: string;
  item: AddLibraryItem;
  surfaces: readonly AddLibrarySurface[];
};

export const ADD_LIBRARY_GROUPS: Array<{
  id: AddLibraryGroupId;
  label: string;
  hint: string;
}> = [
  { id: 'content', label: 'Content', hint: 'Visible layers' },
  { id: 'source', label: 'Sources', hint: 'Generated inputs' },
  { id: 'shaderFill', label: 'Shader Fills', hint: 'Procedural textures' },
  { id: 'shaderEffect', label: 'Shader Effects', hint: 'Input-driven passes' },
  { id: 'material', label: 'Materials', hint: 'PBR surfaces' },
  { id: 'primitive', label: '3D', hint: 'Objects, materials, lighting' },
  { id: 'texture', label: 'Texture', hint: 'Grain, scan, paper' },
  { id: 'light', label: 'Light', hint: 'Glow, burn, haze' },
  { id: 'signal', label: 'Signal', hint: 'Glitch, split, tracking' },
  { id: 'warp', label: 'Warp', hint: 'Distort, bend, ripple' },
  { id: 'tone', label: 'Tone', hint: 'Grade, shift, low-res' },
  { id: 'print', label: 'Print', hint: 'Ink, dots, registration' },
  { id: 'graphic', label: 'Graphic', hint: 'Cutoff, edges, blur' },
  { id: 'utility', label: 'Utility', hint: 'Graph helpers' },
];

const EFFECT_KEYWORDS: Partial<Record<EffectPreset, string>> = {
  duotone: 'photo tone color image recipe two color poster old photo',
  grain: 'paper dust texture print finish popular old photo noisy film',
  dotGrain: 'round grain dot grain stipple ps1 old game shadow texture halftone',
  scanlines: 'crt print line signal texture tv monitor old screen',
  risoShift: 'registration misregister print sticker grid popular',
  overprint: 'ink pressure print sticker',
  cyanotype: 'blue image wash primitive',
  neonGlow: 'glow halo primitive light',
  vignette: 'frame falloff focus image',
  halftone: 'print dots poster damage',
  tear: 'rip paper damage glitch',
  threshold: 'black white damage print cutoff',
  edgeCrush: 'alpha crush hard alpha antialias transparent edge jagged sprite',
  silhouetteCrush: 'silhouette crush edge crush jagged sprite pixel cutout alpha mask',
  bokehBlur: 'bokeh blur lens defocus figma shader soft highlight circles photo',
  hatching: 'hatching hatch line shader figma engraved linework sketch crosshatch',
  retroResolution: 'retro resolution low-res low resolution ps1 old game pixel scale export',
  indexedPalette: 'indexed palette color count low color old game ps1 palette swatches',
  gradientMap: 'gradient map shader figma color ramp luminance tone remap',
  channelMixer: 'channel mixer shader figma rgb matrix color channels remap',
  pixelate: 'pixel block low-res low resolution low res mosaic popular',
  badStream:
    'bad stream low bitrate compression macroblock macroblocks lofi lo-fi stream broken video blocky pixel bad connection',
  macroblocks: 'macroblock macroblocks big blocks codec compression blocky low bitrate video stream',
  detailBlocks: 'detail blocks small blocks codec compression texture lofi low bitrate',
  blockSmear: 'block smear smear copy copied blocks stream freeze bad connection video drag',
  chromaBlocks: 'chroma blocks color blocks color compression chroma drift low bitrate video',
  blockDropout: 'block dropout dropped blocks dark blocks missing stream broken video loss',
  pixelStretch: 'pixel stretch smear directional shader figma streak drag scanline pull',
  patternRefraction: 'pattern refraction shader figma refract wave glass displacement',
  gooeyMerge: 'gooey merge shader figma metaball blob liquid merge',
  dither: 'pixel pattern bayer print texture popular',
};

const EFFECT_DESCRIPTIONS: Record<EffectPreset, string> = {
  shadow: 'A soft drop shadow under the visible shapes.',
  grimeShadow: 'Layered dirty shadow built from the visible alpha.',
  adjust: 'Brightness, contrast, saturation, temperature, hue, and invert in one grade.',
  sharpen: 'Crisps edges and fine detail.',
  rays: 'Colored light beams bursting from the center of the frame.',
  bloom: 'Soft glow bleeding out of the brightest areas, like overexposed film.',
  filmBurn: 'Hot orange flare burning in from one corner.',
  fog: 'Colored haze that fills highlights first, then the shadows.',
  speedLines: 'Thin white manga motion streaks from the center.',
  glitch: 'Horizontal cyan and magenta streaks screened over the image.',
  rgbSplit: 'Offsets the red and blue channels diagonally for a prism fringe.',
  ca: 'Red and blue fringe that grows toward the edges, like a cheap lens.',
  interlace: 'Shifts alternating pixel rows sideways, like a dropped CRT signal.',
  dataMosh: 'Displaces blocks of the frame, like a corrupted video keyframe.',
  vhsTracking: 'Wobbling horizontal bands with a red offset, like bad VHS tracking.',
  matte: 'Coarse, soft blotches of noise for a flat printed matte surface.',
  emboss: 'Raised relief shading that makes edges look pressed into paper.',
  linocut: 'Grey four-level dithered cut, like a carved lino print.',
  noiseWarp: 'Organic distortion driven by smooth noise.',
  morph: 'Liquid sine-wave distortion in both directions.',
  vortex: 'Swirls the image around its center.',
  barrel: 'Bulges the image outward, like a fisheye lens.',
  mirror: 'Folds the image onto itself horizontally, vertically, or both.',
  wave: 'Bends rows sideways along a sine wave.',
  zoomBlur: 'Radial motion blur rushing out of the center.',
  ripple: 'Concentric rings rippling out from the center, like water.',
  squeeze: 'Stretches or squeezes the image horizontally and vertically.',
  tint: 'Multiplies one color over the whole image.',
  hueShift: 'Rotates every hue around the color wheel.',
  vignette: 'Darkens the corners to pull focus to the center.',
  posterize: 'Cuts each color channel down to a few flat bands.',
  sepia: 'Warm brown old-photo color grade.',
  infrared: 'False-color infrared film look with glowing foliage tones.',
  solarize: 'Inverts the brightest tones, like a darkroom solarization.',
  bleachBypass: 'Desaturated, high-contrast silver film look.',
  cyanotype: 'Prussian-blue blueprint print look.',
  duotone: 'Maps shadows and lights to two ink colors.',
  overprint: 'Offset cyan, magenta, and yellow plates multiplied over the image.',
  blur: 'Smooth Gaussian softening of the whole layer.',
  threshold: 'Hard black-and-white cutoff by brightness.',
  edgeDetect: 'Traces edges into bold linework.',
  gradientOverlay: 'Lays a two-color linear gradient over the image.',
  grain: 'Fine surface noise for paper, dust, and old-photo finish.',
  dotGrain: 'Round tone-aware stipple dots for old-game shadows and chunky surface grain.',
  dither: 'Bayer-style pixel texture for crunchy low-color poster output.',
  retroResolution: 'Fixed low internal resolution that keeps the same pixel grid at export size.',
  indexedPalette: 'Editable low-color palette mapping with active swatches and transparency preserved.',
  gradientMap: 'Maps source luminance through a three-color shader ramp.',
  channelMixer: 'Crossfeeds RGB channels into a matrix-like color remap.',
  pixelate: 'Whole-image block size for low-resolution cover treatments.',
  badStream:
    'Low-bitrate stream failure with macroblocks, detail blocks, smear, chroma drift, and dark dropped blocks.',
  macroblocks: 'Large video-codec squares with averaged color and optional dark pressure.',
  detailBlocks: 'Small codec fragments for crunchy low-bitrate texture inside the frame.',
  blockSmear: 'Copied neighboring blocks that smear the frame like a stalled stream.',
  chromaBlocks: 'Blocky chroma compression and color drift, separate from RGB split.',
  blockDropout: 'Dark dropped blocks, like missing packets in a damaged stream.',
  pixelStretch: 'Pulls pixels into directional streaks sampled from the source.',
  patternRefraction: 'Refracts the source through a repeating wave pattern.',
  gooeyMerge: 'Merges nearby shapes into soft liquid blobs.',
  splitTone: 'Push shadows and highlights into two controlled color casts.',
  halftone: 'Screen-print dots for poster texture and print damage.',
  risoShift: 'Ink misregistration for risograph-style color drift.',
  scanlines: 'CRT-style horizontal bands for monitor and video texture.',
  tear: 'Ripped spatial offset for damaged paper and broken motion.',
  edgeCrush: 'Hardens semi-transparent antialiasing into hard alpha cutout edges.',
  silhouetteCrush: 'Chips alpha-mask and high-contrast borders into jagged sprite-like silhouettes.',
  bokehBlur: 'Softens the source with lens-like highlight bloom.',
  hatching: 'Draws tone-aware hatch linework over the source.',
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
  badStream: ['signal', 'low-res', 'compression'],
  macroblocks: ['signal', 'compression', 'blocks'],
  detailBlocks: ['signal', 'compression', 'texture'],
  blockSmear: ['signal', 'smear', 'video'],
  chromaBlocks: ['signal', 'color', 'compression'],
  blockDropout: ['signal', 'damage', 'blocks'],
  pixelStretch: ['signal', 'smear'],
  grain: ['texture', 'paper', 'photo'],
  dotGrain: ['texture', 'dots', 'ps1'],
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
  patternRefraction: ['warp', 'shader'],
  kaleidoscope: ['warp', 'repeat'],
  squeeze: ['warp', 'stretch'],
  tint: ['tone', 'color'],
  hueShift: ['tone', 'color'],
  vignette: ['tone', 'photo'],
  retroResolution: ['tone', 'low-res'],
  pixelate: ['tone', 'low-res'],
  posterize: ['tone', 'steps'],
  indexedPalette: ['tone', 'palette'],
  gradientMap: ['tone', 'shader'],
  channelMixer: ['tone', 'channels'],
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
  edgeCrush: ['graphic', 'alpha'],
  silhouetteCrush: ['graphic', 'edges'],
  edgeDetect: ['graphic', 'line'],
  bokehBlur: ['graphic', 'lens'],
  hatching: ['graphic', 'line'],
  gooeyMerge: ['graphic', 'blob'],
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
  lineField: '≋',
  model: '⬡',
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
    label: '3D Object',
    symbol: KIND_SYMBOL.primitive,
    description: 'A built-in shape or an imported GLB model, with optional scene lighting and an environment map.',
    group: 'primitive',
    action: { kind: 'layer', layerKind: 'primitive' },
    surfaces: ['layers', 'nodes'],
    tags: ['source', '3d'],
    keywords: '3d object primitive shape cylinder sphere cube model glb scene lighting environment hdr',
  },
  {
    id: 'layer:model',
    label: '3D Object · Model file',
    symbol: KIND_SYMBOL.model,
    description: 'A 3D Object that shows an imported GLB model.',
    group: 'primitive',
    action: { kind: 'layer', layerKind: 'model' },
    surfaces: ['nodes'],
    tags: ['source', '3d'],
    keywords: '3d model glb object import ps1 game mesh source',
    // Searchable; browsing shows the one 3D Object item, whose Source switches to a model file.
    showInBrowse: false,
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
    label: 'Shape Pattern',
    symbol: KIND_SYMBOL.array,
    description: 'Draw discs, bars, or diamonds in a line, grid, or radial pattern.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'array' },
    surfaces: ['layers', 'nodes'],
    tags: ['source', 'pattern'],
    keywords: 'array motif sticker grid pattern repeated marks discs bars diamonds',
  },
  {
    id: 'layer:lineField',
    label: 'Line Field',
    symbol: KIND_SYMBOL.lineField,
    description: 'Draw editable optical, contour, and warped line fields.',
    group: 'source',
    action: { kind: 'layer', layerKind: 'lineField' },
    surfaces: ['layers', 'nodes'],
    tags: ['source', 'lines', 'pattern'],
    keywords: 'line field linefield optical contour warped wave stripe stripes mesh grid source pattern',
  },
  {
    id: 'shader:mesh',
    label: 'Shader Fill',
    symbol: '◉',
    description: 'Generate a standalone procedural texture for branches or material maps.',
    group: 'shaderFill',
    action: { kind: 'shader', role: 'fill' },
    surfaces: ['nodes'],
    tags: ['source', 'shader', 'fill', 'material'],
    keywords:
      'shader fill mesh gradient static radial grain noise dots paper water heatmap liquid metal smoke orbit grid spiral swirl waves neuro perlin simplex voronoi metaballs border rings procedural source material texture albedo roughness metalness normal alpha paper design',
  },
  {
    id: 'shader:ai',
    label: 'AI Shader Effect',
    symbol: '✦',
    description: 'Create an editable shader pass that processes a connected source.',
    group: 'shaderEffect',
    action: { kind: 'shader', shaderKind: 'aiShader', role: 'effect' },
    surfaces: ['nodes'],
    tags: ['effect', 'shader', 'ai', 'custom', 'pass'],
    keywords: 'ai shader custom prompt generated editable spec effect pass backdrop source input figma',
    popular: true,
  },
  {
    id: 'shader:code',
    label: 'Code Shader',
    symbol: '</>',
    description: 'Write a GLSL fragment shader that can generate or process a backdrop.',
    group: 'shaderFill',
    action: { kind: 'shader', shaderKind: 'customCode', role: 'fill' },
    surfaces: ['nodes'],
    tags: ['source', 'shader', 'code', 'custom'],
    keywords: 'code shader glsl fragment custom procedural pass backdrop material texture',
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
    // Presets stay searchable; browsing shows the source or node they start from.
    showInBrowse: false,
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
    // Presets stay searchable; browsing shows the source or node they start from.
    showInBrowse: false,
  })),
];

/** Library group and one-line summary of every effect, in browse order. */
const EFFECT_ITEMS: Record<
  EffectId,
  {
    group: Extract<AddLibraryGroupId, 'light' | 'signal' | 'texture' | 'warp' | 'tone' | 'print' | 'graphic'>;
    summary: string;
  }
> = {
  adjust: { group: 'tone', summary: 'Brightness, contrast, saturation, temperature, hue, and invert in one grade.' },
  colorFilter: {
    group: 'tone',
    summary: 'Film and darkroom looks: sepia, infrared, bleach bypass, solarize, cyanotype, or a channel mix.',
  },
  gradientMap: { group: 'tone', summary: 'Maps brightness to two or three colors, or splits shadows and highlights.' },
  colorOverlay: {
    group: 'tone',
    summary: 'A color tint, a two-color gradient, or a brightness-weighted haze over the image.',
  },
  posterize: {
    group: 'tone',
    summary: 'Cuts tones to flat bands, dither, linocut, a hard threshold, or a fixed palette.',
  },
  pixelate: { group: 'tone', summary: 'Chunky blocks or a fixed low resolution that keeps its pixel grid at export.' },
  vignette: { group: 'tone', summary: 'Darkens the corners to pull focus to the center.' },
  glow: { group: 'light', summary: 'Soft bloom or saturated neon around the brightest pixels.' },
  rays: { group: 'light', summary: 'Colored beams or thin speed lines bursting from the center.' },
  filmBurn: { group: 'light', summary: 'Hot orange flare burning in from one corner.' },
  grain: { group: 'texture', summary: 'Fine film noise or coarse matte blotches over the surface.' },
  halftone: { group: 'texture', summary: 'Print screens of dots, hatch lines, or tone-aware stipple.' },
  scanlines: { group: 'texture', summary: 'CRT-style horizontal bands for monitor and video texture.' },
  edges: { group: 'texture', summary: 'Embossed relief or bold traced outlines.' },
  risoShift: { group: 'print', summary: 'Ink misregistration for risograph-style color drift.' },
  overprint: { group: 'print', summary: 'Offset cyan, magenta, and yellow plates multiplied over the image.' },
  channelSplit: { group: 'signal', summary: 'Red and blue channels pulled apart diagonally or toward the edges.' },
  lineGlitch: { group: 'signal', summary: 'Row damage: screened streaks, torn chunks, interlace, or VHS tracking.' },
  compression: { group: 'signal', summary: 'Codec failure: macroblocks and smear, or displaced data-mosh blocks.' },
  displace: { group: 'warp', summary: 'Pushes pixels along noise, liquid, wave, ripple, or pattern fields.' },
  lens: { group: 'warp', summary: 'Barrel bulge, center swirl, or a horizontal and vertical squeeze.' },
  symmetry: { group: 'warp', summary: 'Mirrors the image onto itself or folds it into a kaleidoscope.' },
  blur: { group: 'graphic', summary: 'Soft, lens, zoom, or motion blur.' },
  sharpen: { group: 'graphic', summary: 'Crisps edges and fine detail.' },
  alphaCrush: { group: 'graphic', summary: 'Hardens soft alpha edges or chips them into sprite-like silhouettes.' },
  gooeyMerge: { group: 'graphic', summary: 'Merges nearby shapes into soft liquid blobs.' },
  shadow: {
    group: 'light',
    summary: 'A drop shadow, or a layered dirty shadow, cast by the visible shapes of the input.',
  },
};

function effectPresets(effect: EffectId): EffectPreset[] {
  return EFFECT_PRESET_MENU_ORDER.filter((preset) => effectOfKernel(kernelOfPreset(preset)) === effect);
}

/** The presets each effect absorbs, as search words for its browse item. */
function effectVariantKeywords(effect: EffectId): string {
  return effectPresets(effect)
    .flatMap((preset) => [EFFECT_PRESETS[preset].name.toLowerCase(), EFFECT_KEYWORDS[preset] ?? ''])
    .join(' ');
}

function effectVariantTags(effect: EffectId): string[] {
  return [...new Set(effectPresets(effect).flatMap((preset) => EFFECT_TAGS[preset] ?? []))];
}

/** One browse item per effect; it adds the effect's starter preset. */
const effectItems: AddLibraryItem[] = (Object.keys(EFFECT_ITEMS) as EffectId[]).map((effect) => {
  const { starter, label } = effectSpec(effect);
  return {
    id: `effect:${effect}`,
    label,
    description: EFFECT_ITEMS[effect].summary,
    symbol: EFFECT_PRESETS[starter].icon,
    group: EFFECT_ITEMS[effect].group,
    action: { kind: 'effect', preset: starter },
    surfaces: ['layers', 'nodes'],
    tags: effectVariantTags(effect),
    keywords: effectVariantKeywords(effect),
    popular: ['grain', 'pixelate', 'posterize', 'risoShift'].includes(effect),
  };
});

/**
 * The older focused presets (Sepia, Bloom, Wave, ...) stay findable by search and add their effect in the matching
 * mode, but do not show while browsing.
 */
const effectVariantItems: AddLibraryItem[] = EFFECT_PRESET_MENU_ORDER.filter((preset) => !isEffectId(preset)).map(
  (preset) => {
    const effect = effectOfKernel(kernelOfPreset(preset));
    return {
      id: `effect:${preset}`,
      label: EFFECT_PRESETS[preset].name,
      description: EFFECT_DESCRIPTIONS[preset],
      symbol: EFFECT_PRESETS[preset].icon,
      group: EFFECT_ITEMS[effect].group,
      action: { kind: 'effect', preset },
      surfaces: ['layers', 'nodes'],
      tags: EFFECT_TAGS[preset],
      keywords: `${EFFECT_KEYWORDS[preset] ?? ''} ${effectSpec(effect).label.toLowerCase()}`,
      showInBrowse: false,
    };
  },
);

// Graph-only node kinds with a single library entry, in model registry order, then the repeat presets.
const graphNodeItems: AddLibraryItem[] = GRAPH_NODE_KINDS.flatMap((kind) => {
  const { entry } = GRAPH_NODE_MODELS[kind].library;
  return entry ? [{ id: kind, ...entry, action: { kind } as AddLibraryAction }] : [];
});

const utilityItems: AddLibraryItem[] = [
  ...graphNodeItems,
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
    // Presets stay searchable; browsing shows the source or node they start from.
    showInBrowse: false,
  })),
];

const materialItems: AddLibraryItem[] = [
  {
    id: 'material',
    label: 'PBR Material',
    symbol: '◒',
    description: 'Custom material node with metalness, roughness, relief, grain, and texture maps.',
    group: 'material',
    action: { kind: 'material' },
    surfaces: ['nodes'],
    tags: ['3d', 'material', 'pbr'],
    keywords:
      'pbr material surface shader albedo roughness metalness normal alpha texture maps chrome gold foil metal paper fabric',
    popular: true,
  },
];

const recipeItems: AddLibraryItem[] = RECIPES.map((recipe) => ({
  id: `recipe:${recipe.id}`,
  label: recipe.label,
  symbol: '⊕',
  description: recipe.starter.description,
  group: 'utility',
  action: { kind: 'recipe', recipe: recipe.id },
  surfaces: ['nodes'],
  tags: ['recipe', 'graph'],
  keywords: `recipe group template wired ${recipe.hint.replaceAll('/', ' ')}`,
  showInBrowse: false,
}));

export const ADD_LIBRARY_ITEMS: AddLibraryItem[] = [
  ...layerItems,
  ...sourcePresetItems,
  ...materialItems,
  ...effectItems,
  ...effectVariantItems,
  ...utilityItems,
  ...recipeItems,
];

export const ADD_LIBRARY_RECIPES: AddLibraryRecipe[] = RECIPES.map((recipe, index) => ({
  id: recipe.id,
  label: recipe.label,
  hint: recipe.hint,
  item: recipeItems[index],
  surfaces: ['nodes'],
}));

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
  if (!isActionRecord(value)) return false;
  if (SIMPLE_ADD_ACTION_KINDS.has(value.kind)) return true;
  if (value.kind === 'material') return value.preset === undefined || isPresetId(value.preset, MATERIAL_PRESET_IDS);
  if (value.kind === 'shader') {
    const roleValid = value.role === 'fill' || value.role === 'effect';
    const kindValid =
      value.shaderKind === undefined || isPresetId(value.shaderKind, [...SHADER_KINDS, ...LEGACY_SHADER_KINDS]);
    return roleValid && kindValid && (value.shaderKind !== 'aiShader' || value.role === 'effect');
  }
  return validateAddLibraryActionPayload(value);
}

function isActionRecord(value: unknown): value is {
  kind: string;
  layerKind?: unknown;
  preset?: unknown;
  recipe?: unknown;
  shaderKind?: unknown;
  role?: unknown;
} {
  if (!value || typeof value !== 'object') return false;
  return 'kind' in value && typeof value.kind === 'string';
}

function validateAddLibraryActionPayload(value: {
  kind: string;
  layerKind?: unknown;
  preset?: unknown;
  recipe?: unknown;
}) {
  const validators: Record<string, () => boolean> = {
    layer: () => isLayerAddKind(value.layerKind),
    textPreset: () => isPresetId(value.preset, TEXT_PRESET_IDS),
    effect: () => isEffectPreset(value.preset),
    noisePreset: () => isPresetId(value.preset, NOISE_PRESET_IDS),
    arrayPreset: () => isPresetId(value.preset, ARRAY_PRESET_IDS),
    repeatPreset: () => isPresetId(value.preset, REPEAT_PRESET_IDS),
    recipe: () => isRecipeId(value.recipe),
  };
  return validators[value.kind]?.() ?? false;
}

function isPresetId<T extends string>(value: unknown, ids: readonly T[]): value is T {
  return typeof value === 'string' && ids.includes(value as T);
}

function isLayerAddKind(value: unknown): value is Exclude<LayerKind, 'effect'> {
  return typeof value === 'string' && LAYER_ADD_KINDS.has(value);
}

function isEffectPreset(value: unknown): value is EffectPreset {
  return typeof value === 'string' && EFFECT_PRESET_MENU_ORDER.includes(value as EffectPreset);
}
