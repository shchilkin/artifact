import type { GraphNode } from '../utils/nodeKinds';
import { type EffectPreset, makeEffectPresetLayer } from './effectPresets';
import type { EffectId, EffectParams } from './effectSchema';
import { genId } from './layerIds';
import { inferLinearGraph } from './linearGraph';
import { DEFAULT_MATERIAL_CONFIG, type MaterialConfig, type MaterialTextureInputPort } from './materials';
import type { Scene3DSettings } from './scene3d';
import type { TextFontRef } from './typography';

export * from './effectPresets';
export * from './materials';
export * from './scene3d';

export {
  ALL_EMOJIS,
  FONT_NAMES,
  FONT_OPTIONS,
  FONT_REGISTRY,
  FONT_STACKS,
  type FontName,
  GOOGLE_FONT_STYLESHEET_URL,
  getBundledFontRegistryItem,
  getBundledFontStack,
  isBundledFontName,
  type TextFontRef,
} from './typography';

export type LayerKind =
  | 'text'
  | 'image'
  | 'emoji'
  | 'effect'
  | 'fill'
  | 'primitive'
  | 'noise'
  | 'array'
  | 'lineField'
  | 'model';
export const SOURCE_TYPES = ['primitive', 'noise', 'array', 'lineField', 'model'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
type PrimitiveShape = 'sphere' | 'cube' | 'cylinder';
export const SHADER_KINDS = [
  'paperTexture',
  'water',
  'waterCaustic',
  'heatmap',
  'liquidMetal',
  'gemSmoke',
  'meshGradient',
  'staticRadialGradient',
  'grainGradient',
  'dotOrbit',
  'dotGrid',
  'moire',
  'concentricPatterns',
  'spiral',
  'swirl',
  'waves',
  'glowingWave',
  'neuroNoise',
  'perlin',
  'simplexNoise',
  'voronoi',
  'borderRings',
  'metaballs',
  'colorPanels',
  'smokeRing',
  'noiseField',
  'marble',
  'liquid',
  'aiShader',
  'customCode',
] as const;
export const LEGACY_SHADER_KINDS = ['tilelessTexture'] as const;
export type ShaderKind = (typeof SHADER_KINDS)[number] | (typeof LEGACY_SHADER_KINDS)[number];
export type {
  ShaderDefinition,
  ShaderInstance,
  ShaderPropertyDefinition,
  ShaderPropertyType,
  ShaderPropertyValue,
  ShaderRole,
} from '@artifact/shared';
export type NoiseType = 'value' | 'clouds' | 'cells';
export type ArrayPattern = 'line' | 'grid' | 'radial';
type ArrayShape = 'disc' | 'bar' | 'diamond';
type LineFieldOrientation = 'horizontal' | 'vertical' | 'diagonal' | 'radial';
type LineFieldDistortion = 'none' | 'noise' | 'bulge' | 'wave';

interface BaseLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /**
   * Draw only inside the content of the layer below (the nearest one that is not itself clipped or an effect),
   * like a clipping group. Effect layers ignore it.
   */
  clipToBelow?: boolean;
}

export interface TextLayer extends BaseLayer {
  kind: 'text';
  content: string;
  font: TextFontRef;
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
  /** Extra space between letters, in px at the 540px reference size. */
  tracking: number;
  /** Line height as a percentage of the font size. */
  leading: number;
  /** Outline thickness outside the letters, in px at the reference size; 0 is off. */
  outlineWidth: number;
  outlineColor: string;
  /** Drop shadow strength, 0-100; 0 is off. */
  shadowOpacity: number;
  shadowColor: string;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
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
  seedOffset: number;
  opacity: number;
  blendMode: string;
}

export type FillMode = 'solid' | 'linear' | 'radial';

export interface FillLayer extends BaseLayer {
  kind: 'fill';
  /** Solid uses `color`; gradients run from `color` to `colorB`. */
  fillMode: FillMode;
  color: string;
  colorB: string;
  /** Linear gradient direction in degrees: 0 runs left to right, 90 top to bottom. */
  angle: number;
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
  lineFieldOrientation: LineFieldOrientation;
  lineFieldDistortion: LineFieldDistortion;
  lineFieldCount: number;
  lineFieldSpacing: number;
  lineFieldStroke: number;
  lineFieldStrength: number;
  lineFieldFrequency: number;
  lineFieldBackground: string;
  lineFieldTransparent: boolean;
}

export interface PrimitiveLayer extends ProceduralLayerBase, MaterialConfig {
  kind: 'primitive';
  /** Scene lighting; without it the shape renders with its default light rig. */
  scene?: Scene3DSettings;
}

export interface NoiseLayer extends ProceduralLayerBase {
  kind: 'noise';
}

export interface ArrayLayer extends ProceduralLayerBase {
  kind: 'array';
}

export interface LineFieldLayer extends ProceduralLayerBase {
  kind: 'lineField';
}

export interface ModelLayer extends ProceduralLayerBase {
  kind: 'model';
  modelSrc: string;
  modelName: string;
  modelMime: string;
  modelBytes: number;
  /** Scene lighting; without it the model renders with the default light rig and no environment. */
  scene?: Scene3DSettings;
}

/** A 3D Object layer: a built-in shape (`primitive`) or an imported model. */
export type Object3DLayer = PrimitiveLayer | ModelLayer;

export function isObject3DLayer(layer: Layer | undefined): layer is Object3DLayer {
  return layer?.kind === 'primitive' || layer?.kind === 'model';
}

export type SourceLayer = PrimitiveLayer | NoiseLayer | ArrayLayer | LineFieldLayer | ModelLayer;

/** One effect in an effect layer's stack. `params` holds exactly the parameters its effect owns (`EFFECTS`). */
export interface EffectEntry {
  id: string;
  effect: EffectId;
  enabled: boolean;
  params: EffectParams;
}

/** An effect layer: an ordered stack of effects applied to its input, top to bottom. */
export interface EffectLayer extends BaseLayer {
  kind: 'effect';
  /** The library preset that created this layer; drives its icon and name. */
  preset?: EffectPreset;
  effects: EffectEntry[];
  /** How much of the effected result replaces the input, 0-100. */
  mix: number;
  /** `all` runs the stack on everything below; `layerBelow` runs it on the layer below alone, over what is under it. */
  appliesTo: 'all' | 'layerBelow';
  /** Composites the effect result over its input; defaults to normal (replace). */
  blendMode?: string;
  maskAlpha: boolean;
  seedOffset: number;
}

export type Layer =
  | TextLayer
  | ImageLayer
  | EmojiLayer
  | EffectLayer
  | FillLayer
  | PrimitiveLayer
  | NoiseLayer
  | ArrayLayer
  | LineFieldLayer
  | ModelLayer;

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
  toPort: 'in' | 'bg' | 'a' | 'b' | 'mask' | 'model' | 'env' | 'material' | MaterialTextureInputPort;
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
  /** Graph-only nodes (merge, color, shader, ...) by id. Layers are nodes too but live in `doc.layers`. */
  nodes: Record<string, GraphNode>;
  areas?: GraphArea[];
  primitiveViewStates?: Record<string, PrimitiveViewportStateConfig>;
}

export interface ExportConfig {
  format: 'png' | 'jpeg';
  scale: 1 | 2 | 3;
  target: 'cover' | 'envmap';
}

export interface PortableFontAsset {
  id: string;
  dataUrl: string;
  mime: string;
  bytes: number;
  label: string;
  family: string;
  createdAt: string;
  source?: 'local-file' | 'google-fonts';
  sourceName?: string;
  sourceUrl?: string;
  license?: {
    name: string;
    url?: string;
    allowsEmbedding?: boolean;
  };
  embeddingPolicy?: 'user-confirmed-required' | 'open-license-embeddable';
}

export interface PortableModelAsset {
  id: string;
  dataUrl: string;
  mime: string;
  bytes: number;
  label: string;
  createdAt: string;
}

export interface PortableEnvironmentAsset {
  id: string;
  dataUrl: string;
  mime: string;
  bytes: number;
  label: string;
  createdAt: string;
}

export interface CanvasDocument {
  schemaVersion?: number;
  global: GlobalConfig;
  layers: Layer[];
  graph: CanvasGraph;
  export: ExportConfig;
  fontAssets?: PortableFontAsset[];
  modelAssets?: PortableModelAsset[];
  envAssets?: PortableEnvironmentAsset[];
}

export type { GraphNode, GraphNodeKind } from '../utils/nodeKinds';

export const DOCUMENT_SCHEMA_VERSION = 19;

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

export function makeTextLayer(partial: Partial<TextLayer> = {}): TextLayer {
  return {
    id: genId(),
    name: 'Text',
    visible: true,
    locked: false,
    kind: 'text',
    content: 'TITLE',
    font: 'DISPLAY',
    size: 74,
    color: '#f5ead8',
    opacity: 100,
    blendMode: 'normal',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    align: 'center',
    scaleX: 1,
    scaleY: 1,
    ...TEXT_TYPOGRAPHY_DEFAULTS,
    ...partial,
  };
}

/** Typography fields at the values that draw text as it was drawn before they existed. */
export const TEXT_TYPOGRAPHY_DEFAULTS = {
  tracking: 0,
  leading: 125,
  outlineWidth: 0,
  outlineColor: '#000000',
  shadowOpacity: 0,
  shadowColor: '#000000',
  shadowX: 4,
  shadowY: 6,
  shadowBlur: 8,
} as const satisfies Partial<TextLayer>;

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
    seedOffset: 0,
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
    fillMode: 'solid',
    color: '#120020',
    colorB: '#ff6ec7',
    angle: 90,
    opacity: 100,
    blendMode: 'normal',
    ...partial,
  };
}

type SourceLayerPartial = Partial<
  Omit<ProceduralLayerBase, 'kind'> & MaterialConfig & Omit<ModelLayer, 'id' | 'name' | 'visible' | 'locked' | 'kind'>
>;

export function makeSourceLayer(sourceType: SourceType = 'primitive', partial: SourceLayerPartial = {}): SourceLayer {
  const defaultName =
    sourceType === 'primitive'
      ? '3D Object'
      : sourceType === 'noise'
        ? 'Noise'
        : sourceType === 'lineField'
          ? 'Line Field'
          : sourceType === 'model'
            ? '3D Object'
            : 'Shape Pattern';
  const base = {
    id: genId(),
    name: defaultName,
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
    lineFieldOrientation: 'horizontal',
    lineFieldDistortion: 'none',
    lineFieldCount: 28,
    lineFieldSpacing: 18,
    lineFieldStroke: 3,
    lineFieldStrength: 0,
    lineFieldFrequency: 3,
    lineFieldBackground: '#000000',
    lineFieldTransparent: true,
    modelSrc: '',
    modelName: 'Imported model',
    modelMime: 'model/gltf-binary',
    modelBytes: 0,
  };
  if (sourceType === 'primitive') {
    return {
      ...base,
      ...DEFAULT_MATERIAL_CONFIG,
      ...partial,
      kind: 'primitive',
    } as PrimitiveLayer;
  }
  return {
    ...base,
    ...partial,
    kind: sourceType,
  } as SourceLayer;
}

/** A document built in code whose layers form a plain stack; `graph` defaults to the stack's linear graph. */
export type DocumentInput = Omit<CanvasDocument, 'graph'> & { graph?: CanvasGraph };

/** Every document has a graph. Use this to build documents in code from a layer list. */
export function makeDocument(input: DocumentInput): CanvasDocument {
  return { schemaVersion: DOCUMENT_SCHEMA_VERSION, ...input, graph: input.graph ?? inferLinearGraph(input.layers) };
}

export const DEFAULT_DOCUMENT: CanvasDocument = makeDocument({
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  global: DEFAULT_GLOBAL,
  layers: [
    makeEmojiLayer({ id: 'default-emoji' }),
    makeEffectPresetLayer('rays', {
      id: 'default-rays',
      rays: 14,
      rayInt: 62,
      rayColor: '#bb00ff',
    }),
    makeEffectPresetLayer('tint', {
      id: 'default-tint',
      tint: '#350055',
      tintOp: 28,
    }),
    makeEffectPresetLayer('grain', { id: 'default-grain', grain: 22 }),
    makeEffectPresetLayer('scanlines', {
      id: 'default-scanlines',
      scanlines: 12,
    }),
    makeEffectPresetLayer('rgbSplit', { id: 'default-rgb-split', rgbSplit: 4 }),
  ],
  export: DEFAULT_EXPORT,
});

export function cloneDocument(doc: CanvasDocument): CanvasDocument {
  return {
    schemaVersion: doc.schemaVersion,
    global: { ...doc.global },
    export: { ...doc.export },
    fontAssets: doc.fontAssets?.map((asset) => ({ ...asset })),
    modelAssets: doc.modelAssets?.map((asset) => ({ ...asset })),
    envAssets: doc.envAssets?.map((asset) => ({ ...asset })),
    layers: doc.layers.map((layer) => ({
      ...layer,
      ...(layer.kind === 'emoji' ? { emojis: [...layer.emojis] } : {}),
    })) as Layer[],
    graph: {
      edges: doc.graph.edges.map((e) => ({ ...e })),
      positions: { ...doc.graph.positions },
      nodes: Object.fromEntries(Object.entries(doc.graph.nodes).map(([id, node]) => [id, structuredClone(node)])),
      areas: (doc.graph.areas ?? []).map((area) => ({
        ...area,
        nodeIds: [...area.nodeIds],
      })),
      primitiveViewStates: doc.graph.primitiveViewStates
        ? Object.fromEntries(Object.entries(doc.graph.primitiveViewStates).map(([id, state]) => [id, { ...state }]))
        : undefined,
    },
  };
}
