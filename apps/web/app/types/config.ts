import type { FontName } from './typography';

export { ALL_EMOJIS, FONT_NAMES, FONT_STACKS, type FontName } from './typography';

export const LAYER_KINDS = ['text', 'image', 'emoji', 'effect', 'fill', 'primitive', 'noise', 'array'] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];
export const SOURCE_TYPES = ['primitive', 'noise', 'array'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const PRIMITIVE_SHAPES = ['sphere', 'cube', 'cylinder'] as const;
export type PrimitiveShape = (typeof PRIMITIVE_SHAPES)[number];
export const NOISE_TYPES = ['value', 'clouds', 'cells'] as const;
export type NoiseType = (typeof NOISE_TYPES)[number];
export const ARRAY_PATTERNS = ['line', 'grid', 'radial'] as const;
export type ArrayPattern = (typeof ARRAY_PATTERNS)[number];
export const ARRAY_SHAPES = ['disc', 'bar', 'diamond'] as const;
export type ArrayShape = (typeof ARRAY_SHAPES)[number];

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

export interface ImageAiGenerationMetadata {
  prompt: string;
  provider?: string;
  model?: string;
  quality?: string;
  status?: ImageAiGenerationStatus;
  jobId?: string;
  assetId?: string;
  createdAt?: string;
  updatedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ImageAiGenerationVariant {
  src: string;
  aiGeneration: ImageAiGenerationMetadata;
}

export type ImageAiGenerationStatus =
  | 'queued'
  | 'running'
  | 'importing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface ImageLayer extends BaseLayer {
  kind: 'image';
  src: string;
  aiGeneration?: ImageAiGenerationMetadata;
  aiGenerationHistory?: ImageAiGenerationVariant[];
  aiGenerationHistoryIndex?: number;
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

interface ProceduralLayerBase extends BaseLayer {
  opacity: number;
  blendMode: string;
  seedOffset: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  color: string;
  accentColor: string;
  primitiveShape: PrimitiveShape;
  primitiveShading: 'smooth' | 'flat';
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  primitiveDepth: number;
  noiseType: NoiseType;
  noiseScale: number;
  noiseDetail: number;
  noiseContrast: number;
  noiseBalance: number;
  noiseWarp: number;
  noiseTurbulence: number;
  noiseThreshold: number;
  arrayPattern: ArrayPattern;
  arrayShape: ArrayShape;
  arrayCount: number;
  arrayRows: number;
  arrayGap: number;
  arrayRadius: number;
  arraySize: number;
  arrayJitter: number;
}

export interface PrimitiveLayer extends ProceduralLayerBase {
  kind: 'primitive';
}

export interface NoiseLayer extends ProceduralLayerBase {
  kind: 'noise';
}

export interface ArrayLayer extends ProceduralLayerBase {
  kind: 'array';
}

export type SourceLayer = PrimitiveLayer | NoiseLayer | ArrayLayer;

export type EffectPreset =
  | 'rays'
  | 'bloom'
  | 'filmBurn'
  | 'glitch'
  | 'rgbSplit'
  | 'interlace'
  | 'dataMosh'
  | 'grain'
  | 'scanlines'
  | 'tint'
  | 'noiseWarp'
  | 'morph'
  | 'vortex'
  | 'barrel'
  | 'tear'
  | 'mirror'
  | 'hueShift'
  | 'vignette'
  | 'pixelate'
  | 'posterize'
  | 'duotone'
  | 'halftone'
  | 'risoShift'
  | 'blur'
  | 'threshold'
  | 'edgeDetect'
  | 'gradientOverlay'
  | 'sepia'
  | 'neonGlow'
  | 'zoomBlur'
  | 'vhsTracking'
  | 'dither'
  | 'infrared'
  | 'ca'
  | 'wave'
  | 'matte'
  | 'overprint'
  | 'solarize'
  | 'bleachBypass'
  | 'cyanotype'
  | 'splitTone'
  | 'ripple'
  | 'kaleidoscope'
  | 'squeeze'
  | 'emboss'
  | 'linocut'
  | 'fog'
  | 'speedLines';

export interface EffectLayer extends BaseLayer {
  kind: 'effect';
  preset?: EffectPreset; // which preset created this layer (drives panel icon)
  maskAlpha: boolean;
  grain: number;
  scanlines: number;
  scanlineWidth: number;
  rgbSplit: number;
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
  blurAmt: number;
  threshold: number;
  edgeDetect: number;
  gradMix: number;
  gradA: string;
  gradB: string;
  gradAngle: number;
  // new effects (batch 1)
  sepia: number;
  neonGlow: number;
  neonColor: string;
  zoomBlur: number;
  vhsTracking: number;
  dither: number;
  infrared: number;
  ca: number;
  waveAmt: number;
  waveFreq: number;
  matte: number;
  overprint: number;
  // new effects (batch 2)
  solarize: number;
  bleachBypass: number;
  cyanotype: number;
  splitToneAmt: number;
  splitShadow: string;
  splitHighlight: string;
  rippleAmt: number;
  rippleFreq: number;
  kaleidoscope: number;
  squeezeX: number;
  squeezeY: number;
  emboss: number;
  linocut: number;
  fog: number;
  fogColor: string;
  speedLines: number;
}

export type Layer =
  | TextLayer
  | ImageLayer
  | EmojiLayer
  | EffectLayer
  | FillLayer
  | PrimitiveLayer
  | NoiseLayer
  | ArrayLayer;

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export const ASPECT_SIZES: Record<AspectRatio, [number, number]> = {
  '1:1': [1000, 1000],
  '4:5': [1080, 1350],
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

export interface GraphEdge {
  id: string;
  fromId: string;
  fromPort: 'out';
  toId: string;
  toPort: 'in' | 'bg' | 'a' | 'b';
}

export interface GraphMergeNode {
  id: string;
  name: string;
  blendMode: string;
  opacity: number;
}

export interface GraphColorNode {
  id: string;
  name: string;
  contrast: number; // CSS %, 0–200 (100 = neutral)
  brightness: number; // CSS %, 0–200 (100 = neutral)
  saturation: number; // CSS %, 0–200 (100 = neutral)
  hue: number; // degrees, -180 to 180 (0 = neutral)
}

export interface GraphRepeatNode {
  id: string;
  name: string;
  pattern: ArrayPattern;
  count: number;
  rows: number;
  gap: number;
  radius: number;
  scale: number;
  jitter: number;
  rotation: number;
  seedOffset: number;
  opacity: number;
  blendMode: string;
}

export interface GraphArea {
  id: string;
  name: string;
  nodeIds: string[];
  color: string;
  collapsed?: boolean;
}

export interface PrimitiveViewportStateConfig {
  rotationX: number;
  rotationY: number;
  zoom: number;
  panX: number;
  panY: number;
  locked?: boolean;
}

export interface CanvasGraph {
  edges: GraphEdge[];
  positions: Record<string, { x: number; y: number }>;
  mergeNodes: GraphMergeNode[];
  colorNodes: GraphColorNode[];
  repeatNodes?: GraphRepeatNode[];
  areas?: GraphArea[];
  primitiveViewStates?: Record<string, PrimitiveViewportStateConfig>;
}

export interface ExportConfig {
  format: 'png' | 'jpeg';
  scale: 1 | 2 | 3;
  target: 'cover' | 'envmap';
}

export interface CanvasDocument {
  schemaVersion?: number;
  global: GlobalConfig;
  layers: Layer[];
  graph?: CanvasGraph;
  export: ExportConfig;
}

export const DOCUMENT_SCHEMA_VERSION = 1;

export const DEFAULT_GLOBAL: GlobalConfig = {
  bg: 'transparent',
  seed: 4242,
  aspect: '1:1',
};

export const DEFAULT_EXPORT: ExportConfig = {
  format: 'png',
  scale: 1,
  target: 'cover',
};

export const DEFAULT_EFFECT_LAYER_PROPS: Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked'> = {
  kind: 'effect',
  maskAlpha: false,
  grain: 0,
  scanlines: 0,
  scanlineWidth: 1,
  rgbSplit: 0,
  glitch: 0,
  tint: '#350055',
  tintOp: 0,
  rays: 0,
  rayInt: 0,
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
  blurAmt: 0,
  threshold: 0,
  edgeDetect: 0,
  gradMix: 0,
  gradA: '#0a0020',
  gradB: '#ff6ec7',
  gradAngle: 0,
  sepia: 0,
  neonGlow: 0,
  neonColor: '#ff00ff',
  zoomBlur: 0,
  vhsTracking: 0,
  dither: 0,
  infrared: 0,
  ca: 0,
  waveAmt: 0,
  waveFreq: 3,
  matte: 0,
  overprint: 0,
  solarize: 0,
  bleachBypass: 0,
  cyanotype: 0,
  splitToneAmt: 0,
  splitShadow: '#001a4f',
  splitHighlight: '#ff8040',
  rippleAmt: 0,
  rippleFreq: 3,
  kaleidoscope: 0,
  squeezeX: 0,
  squeezeY: 0,
  emboss: 0,
  linocut: 0,
  fog: 0,
  fogColor: '#c8d8e8',
  speedLines: 0,
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
    opacity: 100,
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
    blur: 0,
    opacity: 100,
    blendMode: 'normal',
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

type SourceLayerPartial = Partial<Omit<ProceduralLayerBase, 'kind'>>;

export function makeSourceLayer(sourceType: SourceType = 'primitive', partial: SourceLayerPartial = {}): SourceLayer {
  return {
    id: genId(),
    name: sourceType === 'primitive' ? 'Primitive' : sourceType === 'noise' ? 'Noise' : 'Array',
    visible: true,
    locked: false,
    kind: sourceType,
    opacity: 100,
    blendMode: 'normal',
    seedOffset: 0,
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    color: '#ff5a36',
    accentColor: '#9d5cff',
    primitiveShape: 'sphere',
    primitiveShading: 'smooth',
    tiltX: -18,
    tiltY: 28,
    tiltZ: 0,
    primitiveDepth: 48,
    noiseType: 'clouds',
    noiseScale: 28,
    noiseDetail: 4,
    noiseContrast: 52,
    noiseBalance: 50,
    noiseWarp: 0,
    noiseTurbulence: 0,
    noiseThreshold: 0,
    arrayPattern: 'grid',
    arrayShape: 'disc',
    arrayCount: 6,
    arrayRows: 4,
    arrayGap: 30,
    arrayRadius: 120,
    arraySize: 36,
    arrayJitter: 0,
    ...partial,
  } as SourceLayer;
}

export function makeEffectLayer(partial: Partial<EffectLayer> = {}): EffectLayer {
  return {
    id: genId(),
    name: 'Effect',
    visible: true,
    locked: false,
    ...DEFAULT_EFFECT_LAYER_PROPS,
    ...partial,
  };
}

// All-zero base for focused single-effect layers
const ZERO_EFFECT: Omit<EffectLayer, 'id' | 'name' | 'visible' | 'locked' | 'kind'> = {
  maskAlpha: false,
  grain: 0,
  scanlines: 0,
  scanlineWidth: 1,
  rgbSplit: 0,
  glitch: 0,
  tint: '#350055',
  tintOp: 0,
  rays: 0,
  rayInt: 0,
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
  blurAmt: 0,
  threshold: 0,
  edgeDetect: 0,
  gradMix: 0,
  gradA: '#0a0020',
  gradB: '#ff6ec7',
  gradAngle: 0,
  sepia: 0,
  neonGlow: 0,
  neonColor: '#ff00ff',
  zoomBlur: 0,
  vhsTracking: 0,
  dither: 0,
  infrared: 0,
  ca: 0,
  waveAmt: 0,
  waveFreq: 3,
  matte: 0,
  overprint: 0,
  solarize: 0,
  bleachBypass: 0,
  cyanotype: 0,
  splitToneAmt: 0,
  splitShadow: '#001a4f',
  splitHighlight: '#ff8040',
  rippleAmt: 0,
  rippleFreq: 3,
  kaleidoscope: 0,
  squeezeX: 0,
  squeezeY: 0,
  emboss: 0,
  linocut: 0,
  fog: 0,
  fogColor: '#c8d8e8',
  speedLines: 0,
};

export type EffectNumericField = {
  [K in keyof EffectLayer]: EffectLayer[K] extends number ? K : never;
}[keyof EffectLayer];

export interface EffectPresetMeta {
  name: string;
  icon: string;
  partial: Partial<EffectLayer>;
  primary: EffectNumericField | null;
}

export const EFFECT_PRESETS: Record<EffectPreset, EffectPresetMeta> = {
  rays: {
    name: 'Rays',
    icon: '✶',
    primary: 'rays',
    partial: { ...ZERO_EFFECT, rays: 16, rayInt: 65, rayColor: '#bb00ff' },
  },
  bloom: { name: 'Bloom', icon: '✹', primary: 'bloom', partial: { ...ZERO_EFFECT, bloom: 30 } },
  filmBurn: { name: 'Film Burn', icon: '☼', primary: 'filmBurn', partial: { ...ZERO_EFFECT, filmBurn: 35 } },
  glitch: { name: 'Glitch', icon: '▒', primary: 'glitch', partial: { ...ZERO_EFFECT, glitch: 14 } },
  interlace: { name: 'Interlace', icon: '≋', primary: 'interlace', partial: { ...ZERO_EFFECT, interlace: 40 } },
  dataMosh: { name: 'Data Mosh', icon: '▥', primary: 'dataMosh', partial: { ...ZERO_EFFECT, dataMosh: 30 } },
  grain: { name: 'Grain', icon: '⣿', primary: 'grain', partial: { ...ZERO_EFFECT, grain: 45 } },
  scanlines: {
    name: 'Scanlines',
    icon: '☰',
    primary: 'scanlines',
    partial: { ...ZERO_EFFECT, scanlines: 18, scanlineWidth: 1 },
  },
  tint: { name: 'Tint', icon: '◈', primary: 'tintOp', partial: { ...ZERO_EFFECT, tint: '#350055', tintOp: 45 } },
  noiseWarp: { name: 'Noise Warp', icon: '◌', primary: 'noiseWarp', partial: { ...ZERO_EFFECT, noiseWarp: 40 } },
  morph: { name: 'Morph', icon: '∿', primary: null, partial: { ...ZERO_EFFECT, morphAmt: 30, morphFreq: 5 } },
  vortex: { name: 'Vortex', icon: '◍', primary: 'vortex', partial: { ...ZERO_EFFECT, vortex: 20 } },
  barrel: { name: 'Barrel', icon: '◔', primary: 'barrel', partial: { ...ZERO_EFFECT, barrel: 25 } },
  tear: { name: 'Tear', icon: '╱', primary: 'tearAmt', partial: { ...ZERO_EFFECT, tearAmt: 8, tearSize: 3 } },
  mirror: { name: 'Mirror', icon: '║', primary: null, partial: { ...ZERO_EFFECT, mirror: 1 } },
  hueShift: { name: 'Hue Shift', icon: '◐', primary: 'hueShift', partial: { ...ZERO_EFFECT, hueShift: 60 } },
  rgbSplit: { name: 'RGB Split', icon: '◭', primary: 'rgbSplit', partial: { ...ZERO_EFFECT, rgbSplit: 8 } },
  vignette: { name: 'Vignette', icon: '◜', primary: 'vignette', partial: { ...ZERO_EFFECT, vignette: 40 } },
  pixelate: { name: 'Pixelate', icon: '▦', primary: 'pixelate', partial: { ...ZERO_EFFECT, pixelate: 8 } },
  posterize: { name: 'Posterize', icon: '◨', primary: 'posterize', partial: { ...ZERO_EFFECT, posterize: 6 } },
  duotone: {
    name: 'Duotone',
    icon: '◎',
    primary: 'duotone',
    partial: { ...ZERO_EFFECT, duotone: 60, duoA: '#0a0020', duoB: '#ff6ec7' },
  },
  halftone: { name: 'Halftone', icon: '◩', primary: 'halftone', partial: { ...ZERO_EFFECT, halftone: 12 } },
  risoShift: {
    name: 'Misregister',
    icon: '⟲',
    primary: 'risoShift',
    partial: { ...ZERO_EFFECT, risoShift: 20, risoAngle: 15 },
  },
  blur: { name: 'Blur', icon: '◯', primary: 'blurAmt', partial: { ...ZERO_EFFECT, blurAmt: 30 } },
  threshold: { name: 'Threshold', icon: '◐', primary: 'threshold', partial: { ...ZERO_EFFECT, threshold: 50 } },
  edgeDetect: { name: 'Edge Detect', icon: '◇', primary: 'edgeDetect', partial: { ...ZERO_EFFECT, edgeDetect: 60 } },
  gradientOverlay: {
    name: 'Gradient',
    icon: '▤',
    primary: 'gradMix',
    partial: { ...ZERO_EFFECT, gradMix: 50, gradA: '#0a0020', gradB: '#ff6ec7', gradAngle: 0 },
  },
  sepia: { name: 'Sepia', icon: '◬', primary: 'sepia', partial: { ...ZERO_EFFECT, sepia: 65 } },
  neonGlow: {
    name: 'Neon Glow',
    icon: '✦',
    primary: 'neonGlow',
    partial: { ...ZERO_EFFECT, neonGlow: 50, neonColor: '#ff00ff' },
  },
  zoomBlur: { name: 'Zoom Blur', icon: '◉', primary: 'zoomBlur', partial: { ...ZERO_EFFECT, zoomBlur: 40 } },
  vhsTracking: { name: 'VHS Track', icon: '⊟', primary: 'vhsTracking', partial: { ...ZERO_EFFECT, vhsTracking: 30 } },
  dither: { name: 'Dither', icon: '⠦', primary: 'dither', partial: { ...ZERO_EFFECT, dither: 50 } },
  infrared: { name: 'Infrared', icon: '⊗', primary: 'infrared', partial: { ...ZERO_EFFECT, infrared: 60 } },
  ca: { name: 'Chrom. Ab.', icon: '◫', primary: 'ca', partial: { ...ZERO_EFFECT, ca: 15 } },
  wave: { name: 'Wave', icon: '〜', primary: 'waveAmt', partial: { ...ZERO_EFFECT, waveAmt: 20, waveFreq: 3 } },
  matte: { name: 'Matte', icon: '▩', primary: 'matte', partial: { ...ZERO_EFFECT, matte: 40 } },
  overprint: { name: 'Overprint', icon: '⊕', primary: 'overprint', partial: { ...ZERO_EFFECT, overprint: 20 } },
  solarize: { name: 'Solarize', icon: '☯', primary: 'solarize', partial: { ...ZERO_EFFECT, solarize: 55 } },
  bleachBypass: {
    name: 'Bleach Bypass',
    icon: '⊙',
    primary: 'bleachBypass',
    partial: { ...ZERO_EFFECT, bleachBypass: 65 },
  },
  cyanotype: { name: 'Cyanotype', icon: '⊆', primary: 'cyanotype', partial: { ...ZERO_EFFECT, cyanotype: 75 } },
  splitTone: {
    name: 'Split Tone',
    icon: '◑',
    primary: 'splitToneAmt',
    partial: { ...ZERO_EFFECT, splitToneAmt: 50, splitShadow: '#001a4f', splitHighlight: '#ff8040' },
  },
  ripple: {
    name: 'Ripple',
    icon: '≈',
    primary: 'rippleAmt',
    partial: { ...ZERO_EFFECT, rippleAmt: 20, rippleFreq: 3 },
  },
  kaleidoscope: {
    name: 'Kaleidoscope',
    icon: '❋',
    primary: 'kaleidoscope',
    partial: { ...ZERO_EFFECT, kaleidoscope: 40 },
  },
  squeeze: { name: 'Squeeze', icon: '⊡', primary: null, partial: { ...ZERO_EFFECT, squeezeX: 30, squeezeY: 0 } },
  emboss: { name: 'Emboss', icon: '▲', primary: 'emboss', partial: { ...ZERO_EFFECT, emboss: 60 } },
  linocut: { name: 'Linocut', icon: '◰', primary: 'linocut', partial: { ...ZERO_EFFECT, linocut: 55 } },
  fog: { name: 'Fog', icon: '≀', primary: 'fog', partial: { ...ZERO_EFFECT, fog: 45, fogColor: '#c8d8e8' } },
  speedLines: { name: 'Speed Lines', icon: '≫', primary: 'speedLines', partial: { ...ZERO_EFFECT, speedLines: 50 } },
};

export const EFFECT_PRESET_MENU_ORDER: EffectPreset[] = [
  'rays',
  'bloom',
  'filmBurn',
  'neonGlow',
  'fog',
  'speedLines',
  'glitch',
  'rgbSplit',
  'ca',
  'interlace',
  'dataMosh',
  'vhsTracking',
  'grain',
  'scanlines',
  'matte',
  'dither',
  'emboss',
  'linocut',
  'tint',
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
  'duotone',
  'halftone',
  'risoShift',
  'overprint',
  'blur',
  'threshold',
  'edgeDetect',
  'gradientOverlay',
];

export type EffectPresetOverrides = Partial<Omit<EffectLayer, 'kind' | 'preset'>> & { value?: number };

export function makeEffectPresetLayer(preset: EffectPreset, overrides: EffectPresetOverrides = {}): EffectLayer {
  const { name, partial, primary } = EFFECT_PRESETS[preset];
  const { value, ...rest } = overrides;
  const valuePatch = value !== undefined && primary ? { [primary]: Math.max(0, Math.min(100, value)) } : {};
  return {
    id: genId(),
    name,
    visible: true,
    locked: false,
    ...partial,
    ...valuePatch,
    ...rest,
    kind: 'effect',
    preset,
  };
}

export const DEFAULT_DOCUMENT: CanvasDocument = {
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  global: DEFAULT_GLOBAL,
  layers: [
    makeEmojiLayer({ id: 'default-emoji' }),
    makeEffectPresetLayer('rays', { id: 'default-rays', rays: 14, rayInt: 62, rayColor: '#bb00ff' }),
    makeEffectPresetLayer('tint', { id: 'default-tint', tint: '#350055', tintOp: 28 }),
    makeEffectPresetLayer('grain', { id: 'default-grain', grain: 22 }),
    makeEffectPresetLayer('scanlines', { id: 'default-scanlines', scanlines: 12 }),
    makeEffectPresetLayer('rgbSplit', { id: 'default-rgb-split', rgbSplit: 4 }),
  ],
  export: DEFAULT_EXPORT,
};

export function makeGraphMergeNode(partial: Partial<GraphMergeNode> = {}): GraphMergeNode {
  return {
    id: `merge-${Date.now()}-${_idCounter++}`,
    name: 'Merge',
    blendMode: 'source-over',
    opacity: 100,
    ...partial,
  };
}

export function makeGraphColorNode(partial: Partial<GraphColorNode> = {}): GraphColorNode {
  return {
    id: `color-${Date.now()}-${_idCounter++}`,
    name: 'Color',
    contrast: 100,
    brightness: 100,
    saturation: 100,
    hue: 0,
    ...partial,
  };
}

export function makeGraphRepeatNode(partial: Partial<GraphRepeatNode> = {}): GraphRepeatNode {
  return {
    id: `repeat-${Date.now()}-${_idCounter++}`,
    name: 'Repeater',
    pattern: 'grid',
    count: 4,
    rows: 3,
    gap: 120,
    radius: 90,
    scale: 28,
    jitter: 0,
    rotation: 0,
    seedOffset: 0,
    opacity: 100,
    blendMode: 'source-over',
    ...partial,
  };
}

export function cloneDocument(doc: CanvasDocument): CanvasDocument {
  return {
    schemaVersion: doc.schemaVersion,
    global: { ...doc.global },
    export: { ...doc.export },
    layers: doc.layers.map((layer) => ({
      ...layer,
      ...(layer.kind === 'emoji' ? { emojis: [...layer.emojis] } : {}),
    })) as Layer[],
    graph: doc.graph
      ? {
          edges: doc.graph.edges.map((e) => ({ ...e })),
          positions: { ...doc.graph.positions },
          mergeNodes: doc.graph.mergeNodes.map((n) => ({ ...n })),
          colorNodes: (doc.graph.colorNodes ?? []).map((n) => ({ ...n })),
          repeatNodes: (doc.graph.repeatNodes ?? []).map((n) => ({ ...n })),
          areas: (doc.graph.areas ?? []).map((area) => ({ ...area, nodeIds: [...area.nodeIds] })),
          primitiveViewStates: doc.graph.primitiveViewStates
            ? Object.fromEntries(Object.entries(doc.graph.primitiveViewStates).map(([id, state]) => [id, { ...state }]))
            : undefined,
        }
      : undefined,
  };
}
