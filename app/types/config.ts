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

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export const ASPECT_SIZES: Record<AspectRatio, [number, number]> = {
  '1:1':  [1000, 1000],
  '4:5':  [1080, 1350],
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
};

export function getPreviewDims(aspect: AspectRatio): [number, number] {
  const dims = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  const [aw, ah] = dims;
  const scale = 540 / Math.max(aw, ah);
  return [Math.round(aw * scale), Math.round(ah * scale)];
}

export interface GlobalConfig {
  bg: string;
  seed: number;
  aspect: AspectRatio;
}

export interface CanvasDocument {
  global: GlobalConfig;
  layers: Layer[];
}

export const DEFAULT_GLOBAL: GlobalConfig = {
  bg: '#120020',
  seed: 4242,
  aspect: '1:1',
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


export function cloneDocument(doc: CanvasDocument): CanvasDocument {
  return {
    global: { ...doc.global },
    layers: doc.layers.map((layer) => ({
      ...layer,
      ...(layer.kind === 'emoji' ? { emojis: [...layer.emojis] } : {}),
    })) as Layer[],
  };
}
