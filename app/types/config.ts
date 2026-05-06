export const ALL_EMOJIS = [
  '😂', '😭', '😢', '😞', '😤', '😮', '😩', '😑',
  '💔', '👽', '💀', '✦', '🤡', '🖤', '💜', '🔥',
  '⚡', '🌑', '🥀', '😈',
];

export const FONT_NAMES = ['MONO', 'DISPLAY', 'VT323', 'SPECIAL'] as const;
export type FontName = typeof FONT_NAMES[number];

export const LAYER_KINDS = ['text', 'image', 'emoji', 'effect', 'fill'] as const;
export type LayerKind = typeof LAYER_KINDS[number];

interface BaseLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface TextLayer extends BaseLayer {
  kind: 'text';
  content: string;
  font: FontName;
  size: number;
  color: string;
  opacity: number;
  blendMode: string;
  x: number;
  y: number;
  rotation: number;
  align: 'left' | 'center' | 'right';
  scaleX: number;
  scaleY: number;
}

export interface ImageLayer extends BaseLayer {
  kind: 'image';
  src: string;
  fit: 'cover' | 'contain' | 'tile' | 'free';
  opacity: number;
  blendMode: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface EmojiLayer extends BaseLayer {
  kind: 'emoji';
  emojis: string[];
  density: number;
  minSz: number;
  maxSz: number;
  blur: number;
  opacity: number;
  blendMode: string;
}

export interface FillLayer extends BaseLayer {
  kind: 'fill';
  color: string;
  opacity: number;
  blendMode: string;
}

export type EffectPreset = 'rays' | 'glitch' | 'grain' | 'tint' | 'warp' | 'color' | 'riso';

export interface EffectLayer extends BaseLayer {
  kind: 'effect';
  preset?: EffectPreset;  // which preset created this layer (drives panel icon)
  grain: number;
  scanlines: number;
  ca: number;
  glitch: number;
  tint: string;
  tintOp: number;
  rays: number;
  rayInt: number;
  rayColor: string;
  morphAmt: number;
  morphFreq: number;
  tearAmt: number;
  tearSize: number;
  noiseWarp: number;
  vortex: number;
  barrel: number;
  mirror: number;
  dataMosh: number;
  interlace: number;
  pixelate: number;
  hueShift: number;
  rgbSplit: number;
  vignette: number;
  bloom: number;
  posterize: number;
  filmBurn: number;
  duotone: number;
  duoA: string;
  duoB: string;
  halftone: number;
  risoShift: number;
  risoAngle: number;
}

export type Layer = TextLayer | ImageLayer | EmojiLayer | EffectLayer | FillLayer;

export interface GlobalConfig {
  bg: string;
  seed: number;
}

export interface CanvasDocument {
  global: GlobalConfig;
  layers: Layer[];
}

export const DEFAULT_GLOBAL: GlobalConfig = {
  bg: '#120020',
  seed: 4242,
};

export const DEFAULT_EFFECT_LAYER_PROPS: Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked'> = {
  kind: 'effect',
  grain: 22,
  scanlines: 12,
  ca: 4,
  glitch: 7,
  tint: '#350055',
  tintOp: 28,
  rays: 14,
  rayInt: 62,
  rayColor: '#bb00ff',
  morphAmt: 0,
  morphFreq: 5,
  tearAmt: 0,
  tearSize: 3,
  noiseWarp: 0,
  vortex: 0,
  barrel: 0,
  mirror: 0,
  dataMosh: 0,
  interlace: 0,
  pixelate: 0,
  hueShift: 0,
  rgbSplit: 0,
  vignette: 0,
  bloom: 0,
  posterize: 0,
  filmBurn: 0,
  duotone: 0,
  duoA: '#0a0020',
  duoB: '#ff6ec7',
  halftone: 0,
  risoShift: 0,
  risoAngle: 15,
};

let _idCounter = 0;
function genId(): string {
  return `layer-${Date.now()}-${_idCounter++}`;
}

export function makeTextLayer(partial: Partial<TextLayer> = {}): TextLayer {
  return {
    id: genId(),
    name: 'Text',
    visible: true,
    locked: false,
    kind: 'text',
    content: '',
    font: 'DISPLAY',
    size: 52,
    color: '#ffffff',
    opacity: 100,
    blendMode: 'normal',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    align: 'center',
    scaleX: 1,
    scaleY: 1,
    ...partial,
  };
}

export function makeImageLayer(src: string, partial: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: genId(),
    name: 'Image',
    visible: true,
    locked: false,
    kind: 'image',
    src,
    fit: 'cover',
    opacity: 85,
    blendMode: 'normal',
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...partial,
  };
}

export function makeEmojiLayer(partial: Partial<EmojiLayer> = {}): EmojiLayer {
  return {
    id: genId(),
    name: 'Emojis',
    visible: true,
    locked: false,
    kind: 'emoji',
    emojis: ['😂', '😭', '💔', '👽', '💀', '😤', '😮', '✦'],
    density: 40,
    minSz: 24,
    maxSz: 72,
    blur: 58,
    opacity: 100,
    blendMode: 'source-over',
    ...partial,
  };
}

export function makeFillLayer(partial: Partial<FillLayer> = {}): FillLayer {
  return {
    id: genId(),
    name: 'Fill',
    visible: true,
    locked: false,
    kind: 'fill',
    color: '#120020',
    opacity: 100,
    blendMode: 'normal',
    ...partial,
  };
}

export function makeEffectLayer(partial: Partial<EffectLayer> = {}): EffectLayer {
  return {
    id: genId(),
    name: 'FX',
    visible: true,
    locked: false,
    ...DEFAULT_EFFECT_LAYER_PROPS,
    ...partial,
  };
}

// All-zero base for focused single-effect layers
const ZERO_EFFECT: Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked' | 'kind'> = {
  grain: 0, scanlines: 0, ca: 0, glitch: 0,
  tint: '#350055', tintOp: 0,
  rays: 0, rayInt: 0, rayColor: '#bb00ff',
  morphAmt: 0, morphFreq: 5, tearAmt: 0, tearSize: 3,
  noiseWarp: 0, vortex: 0, barrel: 0, mirror: 0, dataMosh: 0, interlace: 0,
  pixelate: 0, hueShift: 0, rgbSplit: 0, vignette: 0, bloom: 0, posterize: 0, filmBurn: 0,
  duotone: 0, duoA: '#0a0020', duoB: '#ff6ec7', halftone: 0, risoShift: 0, risoAngle: 15,
};

export const EFFECT_PRESETS: Record<EffectPreset, { name: string; icon: string; partial: Partial<EffectLayer> }> = {
  rays:  { name: 'Rays',    icon: '✶', partial: { ...ZERO_EFFECT, rays: 16, rayInt: 65, rayColor: '#bb00ff', bloom: 30 } },
  glitch:{ name: 'Glitch',  icon: '▒', partial: { ...ZERO_EFFECT, glitch: 14, ca: 6, interlace: 40, dataMosh: 30, rgbSplit: 8 } },
  grain: { name: 'Grain',   icon: '⣿', partial: { ...ZERO_EFFECT, grain: 45, scanlines: 18, filmBurn: 35 } },
  tint:  { name: 'Tint',    icon: '◈', partial: { ...ZERO_EFFECT, tint: '#350055', tintOp: 45, vignette: 40 } },
  warp:  { name: 'Warp',    icon: '◌', partial: { ...ZERO_EFFECT, noiseWarp: 40, morphAmt: 30, morphFreq: 5, barrel: 25, vortex: 20 } },
  color: { name: 'Color',   icon: '◐', partial: { ...ZERO_EFFECT, hueShift: 60, bloom: 40, posterize: 6, duotone: 60, duoA: '#0a0020', duoB: '#ff6ec7' } },
  riso:  { name: 'Riso',    icon: '◎', partial: { ...ZERO_EFFECT, halftone: 12, risoShift: 20, risoAngle: 15 } },
};

export function makeEffectPresetLayer(preset: EffectPreset): EffectLayer {
  const { name, partial } = EFFECT_PRESETS[preset];
  return { id: genId(), name, visible: true, locked: false, kind: 'effect', preset, ...partial } as EffectLayer;
}

export const DEFAULT_DOCUMENT: CanvasDocument = {
  global: DEFAULT_GLOBAL,
  layers: [
    makeEmojiLayer({ id: 'default-emoji' }),
    makeEffectLayer({ id: 'default-effect' }),
  ],
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asEmojiList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
}

function asAlign(value: unknown, fallback: TextLayer['align']): TextLayer['align'] {
  return value === 'left' || value === 'center' || value === 'right' ? value : fallback;
}

function asFont(value: unknown, fallback: FontName): FontName {
  return FONT_NAMES.includes(value as FontName) ? (value as FontName) : fallback;
}

export function migrateFromV1(seed: number, cfg: Record<string, unknown>): CanvasDocument {
  const emojiDefaults = makeEmojiLayer();

  const emojiLayer = makeEmojiLayer({
    id: 'migrated-emoji',
    emojis: asEmojiList(cfg.emojis, emojiDefaults.emojis),
    density: asNumber(cfg.density, emojiDefaults.density),
    minSz: asNumber(cfg.minSz, emojiDefaults.minSz),
    maxSz: asNumber(cfg.maxSz, emojiDefaults.maxSz),
    blur: asNumber(cfg.blur, emojiDefaults.blur),
  });

  const effectLayer = makeEffectLayer({
    id: 'migrated-effect',
    grain: asNumber(cfg.grain, DEFAULT_EFFECT_LAYER_PROPS.grain),
    scanlines: asNumber(cfg.scanlines, DEFAULT_EFFECT_LAYER_PROPS.scanlines),
    ca: asNumber(cfg.ca, DEFAULT_EFFECT_LAYER_PROPS.ca),
    glitch: asNumber(cfg.glitch, DEFAULT_EFFECT_LAYER_PROPS.glitch),
    tint: asString(cfg.tint, DEFAULT_EFFECT_LAYER_PROPS.tint),
    tintOp: asNumber(cfg.tintOp, DEFAULT_EFFECT_LAYER_PROPS.tintOp),
    rays: asNumber(cfg.rays, DEFAULT_EFFECT_LAYER_PROPS.rays),
    rayInt: asNumber(cfg.rayInt, DEFAULT_EFFECT_LAYER_PROPS.rayInt),
    rayColor: asString(cfg.rayColor, DEFAULT_EFFECT_LAYER_PROPS.rayColor),
    morphAmt: asNumber(cfg.morphAmt, DEFAULT_EFFECT_LAYER_PROPS.morphAmt),
    morphFreq: asNumber(cfg.morphFreq, DEFAULT_EFFECT_LAYER_PROPS.morphFreq),
    tearAmt: asNumber(cfg.tearAmt, DEFAULT_EFFECT_LAYER_PROPS.tearAmt),
    tearSize: asNumber(cfg.tearSize, DEFAULT_EFFECT_LAYER_PROPS.tearSize),
    noiseWarp: asNumber(cfg.noiseWarp, DEFAULT_EFFECT_LAYER_PROPS.noiseWarp),
    vortex: asNumber(cfg.vortex, DEFAULT_EFFECT_LAYER_PROPS.vortex),
    barrel: asNumber(cfg.barrel, DEFAULT_EFFECT_LAYER_PROPS.barrel),
    mirror: asNumber(cfg.mirror, DEFAULT_EFFECT_LAYER_PROPS.mirror),
    dataMosh: asNumber(cfg.dataMosh, DEFAULT_EFFECT_LAYER_PROPS.dataMosh),
    interlace: asNumber(cfg.interlace, DEFAULT_EFFECT_LAYER_PROPS.interlace),
    pixelate: asNumber(cfg.pixelate, DEFAULT_EFFECT_LAYER_PROPS.pixelate),
    hueShift: asNumber(cfg.hueShift, DEFAULT_EFFECT_LAYER_PROPS.hueShift),
    rgbSplit: asNumber(cfg.rgbSplit, DEFAULT_EFFECT_LAYER_PROPS.rgbSplit),
    vignette: asNumber(cfg.vignette, DEFAULT_EFFECT_LAYER_PROPS.vignette),
    bloom: asNumber(cfg.bloom, DEFAULT_EFFECT_LAYER_PROPS.bloom),
    posterize: asNumber(cfg.posterize, DEFAULT_EFFECT_LAYER_PROPS.posterize),
    filmBurn: asNumber(cfg.filmBurn, DEFAULT_EFFECT_LAYER_PROPS.filmBurn),
    duotone: asNumber(cfg.duotone, DEFAULT_EFFECT_LAYER_PROPS.duotone),
    duoA: asString(cfg.duoA, DEFAULT_EFFECT_LAYER_PROPS.duoA),
    duoB: asString(cfg.duoB, DEFAULT_EFFECT_LAYER_PROPS.duoB),
    halftone: asNumber(cfg.halftone, DEFAULT_EFFECT_LAYER_PROPS.halftone),
    risoShift: asNumber(cfg.risoShift, DEFAULT_EFFECT_LAYER_PROPS.risoShift),
    risoAngle: asNumber(cfg.risoAngle, DEFAULT_EFFECT_LAYER_PROPS.risoAngle),
  });

  const layers: Layer[] = [emojiLayer, effectLayer];

  if (typeof cfg.text === 'string' && cfg.text.trim()) {
    layers.push(
      makeTextLayer({
        id: 'migrated-text',
        content: cfg.text,
        font: asFont(cfg.textFont, 'DISPLAY'),
        size: asNumber(cfg.textSize, 52),
        color: asString(cfg.textColor, '#ffffff'),
        opacity: asNumber(cfg.textOpacity, 100),
        blendMode: asString(cfg.textBlend, 'normal'),
        x: asNumber(cfg.textX, 0.5),
        y: asNumber(cfg.textY, 0.5),
        rotation: asNumber(cfg.textRotation, 0),
        align: asAlign(cfg.textAlign, 'center'),
      }),
    );
  }

  return {
    global: {
      bg: asString(cfg.bg, DEFAULT_GLOBAL.bg),
      seed,
    },
    layers,
  };
}

export function cloneDocument(doc: CanvasDocument): CanvasDocument {
  return {
    global: { ...doc.global },
    layers: doc.layers.map((layer) => ({
      ...layer,
      ...(layer.kind === 'emoji' ? { emojis: [...layer.emojis] } : {}),
    })) as Layer[],
  };
}

export interface GeneratorConfig {
  bg: string;
  emojis: string[];
  density: number;
  minSz: number;
  maxSz: number;
  blur: number;
  grain: number;
  scanlines: number;
  rayInt: number;
  rayColor: string;
  rays: number;
  ca: number;
  glitch: number;
  tint: string;
  tintOp: number;
  morphAmt: number;
  morphFreq: number;
  tearAmt: number;
  tearSize: number;
  noiseWarp: number;
  vortex: number;
  barrel: number;
  mirror: number;
  dataMosh: number;
  interlace: number;
  pixelate: number;
  hueShift: number;
  rgbSplit: number;
  vignette: number;
  bloom: number;
  posterize: number;
  filmBurn: number;
  duotone: number;
  duoA: string;
  duoB: string;
  halftone: number;
  risoShift: number;
  risoAngle: number;
  text: string;
  textFont: FontName;
  textSize: number;
  textColor: string;
  textOpacity: number;
  textX: number;
  textY: number;
  textRotation: number;
  textAlign: TextLayer['align'];
  textBlend: string;
  bgImageFit: ImageLayer['fit'];
  bgImageOpacity: number;
  bgImageBlend: string;
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  bg: DEFAULT_GLOBAL.bg,
  emojis: makeEmojiLayer().emojis,
  density: makeEmojiLayer().density,
  minSz: makeEmojiLayer().minSz,
  maxSz: makeEmojiLayer().maxSz,
  blur: makeEmojiLayer().blur,
  grain: DEFAULT_EFFECT_LAYER_PROPS.grain,
  scanlines: DEFAULT_EFFECT_LAYER_PROPS.scanlines,
  rayInt: DEFAULT_EFFECT_LAYER_PROPS.rayInt,
  rayColor: DEFAULT_EFFECT_LAYER_PROPS.rayColor,
  rays: DEFAULT_EFFECT_LAYER_PROPS.rays,
  ca: DEFAULT_EFFECT_LAYER_PROPS.ca,
  glitch: DEFAULT_EFFECT_LAYER_PROPS.glitch,
  tint: DEFAULT_EFFECT_LAYER_PROPS.tint,
  tintOp: DEFAULT_EFFECT_LAYER_PROPS.tintOp,
  morphAmt: DEFAULT_EFFECT_LAYER_PROPS.morphAmt,
  morphFreq: DEFAULT_EFFECT_LAYER_PROPS.morphFreq,
  tearAmt: DEFAULT_EFFECT_LAYER_PROPS.tearAmt,
  tearSize: DEFAULT_EFFECT_LAYER_PROPS.tearSize,
  noiseWarp: DEFAULT_EFFECT_LAYER_PROPS.noiseWarp,
  vortex: DEFAULT_EFFECT_LAYER_PROPS.vortex,
  barrel: DEFAULT_EFFECT_LAYER_PROPS.barrel,
  mirror: DEFAULT_EFFECT_LAYER_PROPS.mirror,
  dataMosh: DEFAULT_EFFECT_LAYER_PROPS.dataMosh,
  interlace: DEFAULT_EFFECT_LAYER_PROPS.interlace,
  pixelate: DEFAULT_EFFECT_LAYER_PROPS.pixelate,
  hueShift: DEFAULT_EFFECT_LAYER_PROPS.hueShift,
  rgbSplit: DEFAULT_EFFECT_LAYER_PROPS.rgbSplit,
  vignette: DEFAULT_EFFECT_LAYER_PROPS.vignette,
  bloom: DEFAULT_EFFECT_LAYER_PROPS.bloom,
  posterize: DEFAULT_EFFECT_LAYER_PROPS.posterize,
  filmBurn: DEFAULT_EFFECT_LAYER_PROPS.filmBurn,
  duotone: DEFAULT_EFFECT_LAYER_PROPS.duotone,
  duoA: DEFAULT_EFFECT_LAYER_PROPS.duoA,
  duoB: DEFAULT_EFFECT_LAYER_PROPS.duoB,
  halftone: DEFAULT_EFFECT_LAYER_PROPS.halftone,
  risoShift: DEFAULT_EFFECT_LAYER_PROPS.risoShift,
  risoAngle: DEFAULT_EFFECT_LAYER_PROPS.risoAngle,
  text: '',
  textFont: 'DISPLAY',
  textSize: 52,
  textColor: '#ffffff',
  textOpacity: 100,
  textX: 0.5,
  textY: 0.5,
  textRotation: 0,
  textAlign: 'center',
  textBlend: 'normal',
  bgImageFit: 'cover',
  bgImageOpacity: 85,
  bgImageBlend: 'normal',
};
