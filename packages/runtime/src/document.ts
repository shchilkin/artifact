import { parseArtifactRuntimeProject } from './project.js';
import {
  applyChromaticAberration,
  applyGlitchEffect,
  applyGrain,
  applyScanlines,
  drawDocumentBackground,
  drawEmojiLayer,
  drawFillLayer,
  drawImageLayer,
  drawTextLayer,
  lcg,
  loadRuntimeImage,
} from './rendering.js';
import type {
  AnalyzeArtifactRuntimeProjectOptions,
  ArtifactRuntimeCapabilityIssue,
  ArtifactRuntimeCapabilityReport,
  ArtifactRuntimeGraph,
  ArtifactRuntimeProject,
  ArtifactRuntimeUnresolvedFont,
  RenderArtifactRuntimeProjectOptions,
} from './types.js';

const EXPORT_NODE_ID = '__export__';
const REFERENCE_SIZE = 540;
const SUPPORTED_LAYER_KINDS = new Set(['effect', 'emoji', 'fill', 'image', 'text']);
const SUPPORTED_EFFECT_PRESETS = new Set(['ca', 'glitch', 'grain', 'noiseWarp', 'scanlines', 'tear', 'vortex']);
const EFFECT_PRIMARY_PROPERTIES: Readonly<Record<string, string>> = {
  ca: 'ca',
  glitch: 'glitch',
  grain: 'grain',
  noiseWarp: 'noiseWarp',
  scanlines: 'scanlines',
  tear: 'tearAmt',
  vortex: 'vortex',
};
const UNSUPPORTED_POSITIVE_EFFECT_PROPERTIES = [
  'badStream',
  'rgbSplit',
  'retroResolution',
  'dotGrain',
  'tintOp',
  'rays',
  'rayInt',
  'morphAmt',
  'barrel',
  'mirror',
  'dataMosh',
  'interlace',
  'pixelate',
  'hueShift',
  'vignette',
  'bloom',
  'posterize',
  'indexedPalette',
  'gradientMap',
  'channelMixer',
  'filmBurn',
  'duotone',
  'halftone',
  'risoShift',
  'blurAmt',
  'threshold',
  'edgeCrush',
  'silhouetteCrush',
  'pixelStretch',
  'edgeDetect',
  'bokehBlur',
  'hatching',
  'gooeyMerge',
  'gradMix',
  'sepia',
  'neonGlow',
  'zoomBlur',
  'vhsTracking',
  'dither',
  'infrared',
  'waveAmt',
  'matte',
  'overprint',
  'solarize',
  'bleachBypass',
  'cyanotype',
  'splitToneAmt',
  'rippleAmt',
  'patternRefraction',
  'kaleidoscope',
  'emboss',
  'linocut',
  'fog',
  'speedLines',
] as const;
const UNSUPPORTED_NONZERO_EFFECT_PROPERTIES = ['squeezeX', 'squeezeY'] as const;
const GRAPH_NODE_COLLECTIONS = [
  'mergeNodes',
  'colorNodes',
  'repeatNodes',
  'materialNodes',
  'maskNodes',
  'transformNodes',
  'grimeShadowNodes',
  'scene3dNodes',
  'environmentNodes',
  'shaderNodes',
] as const;

type RuntimeLayer = Record<string, unknown> & {
  align?: string;
  blendMode?: string;
  ca?: number;
  color?: string;
  content?: string;
  density?: number;
  emojis?: string[];
  fit?: string;
  font?: string;
  glitch?: number;
  grain?: number;
  id: string;
  kind: string;
  maxSz?: number;
  minSz?: number;
  noiseWarp?: number;
  opacity?: number;
  preset?: string;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  scanlines?: number;
  scanlineWidth?: number;
  seedOffset?: number;
  size?: number;
  src?: string;
  tearAmt?: number;
  tearSize?: number;
  visible?: boolean;
  vortex?: number;
  x?: number;
  y?: number;
};

export class ArtifactRuntimeUnsupportedError extends Error {
  readonly report: ArtifactRuntimeCapabilityReport;

  constructor(report: ArtifactRuntimeCapabilityReport) {
    super(`Artifact Runtime cannot render this document: ${report.issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'ArtifactRuntimeUnsupportedError';
    this.report = report;
  }
}

function isRuntimeLayer(layer: Record<string, unknown>): layer is RuntimeLayer {
  return typeof layer.id === 'string' && typeof layer.kind === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportUnsupportedGraphCollections(graph: ArtifactRuntimeGraph, issues: ArtifactRuntimeCapabilityIssue[]) {
  for (const collection of GRAPH_NODE_COLLECTIONS) {
    for (const [index, node] of (graph[collection] ?? []).entries()) {
      const graphNodeId = isRecord(node) && typeof node.id === 'string' ? node.id : `${collection}[${index}]`;
      issues.push({
        code: 'unsupported-graph-node',
        graphNodeId,
        message: `Graph node ${graphNodeId} in ${collection} is not supported by full-document alpha playback.`,
      });
    }
  }
}

function indexIncomingEdges(graph: ArtifactRuntimeGraph) {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const sources = incoming.get(edge.toId) ?? [];
    sources.push(edge.fromId);
    incoming.set(edge.toId, sources);
  }
  return incoming;
}

function traceLinearOrder(incoming: Map<string, string[]>, issues: ArtifactRuntimeCapabilityIssue[]): string[] {
  const reversed: string[] = [];
  const visited = new Set<string>();
  let current = EXPORT_NODE_ID;
  while (true) {
    const sources = incoming.get(current) ?? [];
    if (sources.length === 0) break;
    if (sources.length !== 1) {
      issues.push({
        code: 'invalid-graph',
        message: `Node ${current} has ${sources.length} inputs; only one linear input is supported.`,
      });
      break;
    }
    const source = sources[0];
    if (visited.has(source)) {
      issues.push({ code: 'invalid-graph', message: `Graph contains a cycle at ${source}.` });
      break;
    }
    visited.add(source);
    reversed.push(source);
    current = source;
  }
  return reversed.reverse();
}

function validateLinearOrder(
  graph: ArtifactRuntimeGraph,
  order: string[],
  layerIds: Set<string>,
  issues: ArtifactRuntimeCapabilityIssue[],
) {
  const orderSet = new Set(order);
  const hasUnknownLayers = order.some((id) => !layerIds.has(id));
  const hasOmittedLayers = [...layerIds].some((id) => !orderSet.has(id));
  if (hasUnknownLayers || hasOmittedLayers || order.length === 0) {
    issues.push({
      code: 'invalid-graph',
      message: 'Graph must be one complete layer chain ending at the export node.',
    });
  }
  if (graph.edges.length !== order.length) {
    issues.push({
      code: 'invalid-graph',
      message: 'Graph contains branches or disconnected edges outside the export chain.',
    });
  }
}

function getLinearGraphOrder(
  graph: ArtifactRuntimeGraph,
  layerIds: Set<string>,
  issues: ArtifactRuntimeCapabilityIssue[],
): string[] {
  reportUnsupportedGraphCollections(graph, issues);
  const order = traceLinearOrder(indexIncomingEdges(graph), issues);
  validateLinearOrder(graph, order, layerIds, issues);
  return order;
}

function fontFamilyForLayer(layer: RuntimeLayer, options: AnalyzeArtifactRuntimeProjectOptions): string | null {
  const font = layer.font;
  if (typeof font !== 'string' || font.length === 0) return null;
  if (!font.startsWith('artifact-font://')) return options.fontFamilies?.[font] ?? font;
  return options.fontFamilies?.[font] ?? null;
}

interface LayerCapabilityContext {
  issues: ArtifactRuntimeCapabilityIssue[];
  options: AnalyzeArtifactRuntimeProjectOptions;
  requiredFonts: Set<string>;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function effectParameterBlockers(layer: RuntimeLayer, preset: string): string[] {
  const primaryProperty = EFFECT_PRIMARY_PROPERTIES[preset];
  const primaryValue = primaryProperty ? layer[primaryProperty] : undefined;
  const blockers = isFiniteNonNegativeNumber(primaryValue) ? [] : [primaryProperty ?? `preset:${preset}`];
  if (preset !== 'tear' || !isFiniteNonNegativeNumber(primaryValue) || primaryValue === 0) return blockers;
  if (typeof layer.tearSize !== 'number' || !Number.isFinite(layer.tearSize) || layer.tearSize <= 0) {
    blockers.push('tearSize');
  }
  return blockers;
}

function reportEffectCapability(layer: RuntimeLayer, context: LayerCapabilityContext) {
  const preset = String(layer.preset);
  const blockers = [
    ...(layer.maskAlpha === true ? ['maskAlpha'] : []),
    ...UNSUPPORTED_POSITIVE_EFFECT_PROPERTIES.filter((property) => Number(layer[property] ?? 0) > 0),
    ...UNSUPPORTED_NONZERO_EFFECT_PROPERTIES.filter((property) => Number(layer[property] ?? 0) !== 0),
  ];
  if (!SUPPORTED_EFFECT_PRESETS.has(preset)) {
    blockers.unshift(`preset:${preset}`);
  } else {
    blockers.push(...effectParameterBlockers(layer, preset));
  }
  if (blockers.length > 0) {
    context.issues.push({
      code: 'unsupported-effect',
      layerId: layer.id,
      message: `Effect layer ${layer.id} uses unsupported behavior: ${blockers.join(', ')}.`,
    });
  }
}

function reportImageCapability(layer: RuntimeLayer, context: LayerCapabilityContext) {
  if (typeof layer.src === 'string' && layer.src.length > 0 && !layer.src.startsWith('artifact-asset://')) return;
  context.issues.push({
    code: 'missing-image',
    layerId: layer.id,
    message:
      typeof layer.src === 'string' && layer.src.startsWith('artifact-asset://')
        ? `Image layer ${layer.id} contains unresolved local asset ${layer.src}.`
        : `Image layer ${layer.id} has no source.`,
  });
}

function reportTextCapability(layer: RuntimeLayer, context: LayerCapabilityContext) {
  if (typeof layer.font === 'string') context.requiredFonts.add(layer.font);
  if (fontFamilyForLayer(layer, context.options)) return;
  context.issues.push({
    code: 'missing-font',
    layerId: layer.id,
    message:
      typeof layer.font === 'string'
        ? `Text layer ${layer.id} requires a host font mapping for ${layer.font}.`
        : `Text layer ${layer.id} has no font reference.`,
  });
}

const LAYER_CAPABILITY_REPORTERS: Readonly<
  Record<string, (layer: RuntimeLayer, context: LayerCapabilityContext) => void>
> = {
  effect: reportEffectCapability,
  image: reportImageCapability,
  text: reportTextCapability,
};

function reportLayerCapabilities(
  layer: RuntimeLayer,
  options: AnalyzeArtifactRuntimeProjectOptions,
  requiredFonts: Set<string>,
  issues: ArtifactRuntimeCapabilityIssue[],
) {
  if (!SUPPORTED_LAYER_KINDS.has(layer.kind)) {
    issues.push({
      code: 'unsupported-layer-kind',
      layerId: layer.id,
      message: `Layer ${layer.id} uses unsupported kind ${layer.kind}.`,
    });
    return;
  }
  LAYER_CAPABILITY_REPORTERS[layer.kind]?.(layer, { issues, options, requiredFonts });
}

function collectUnresolvedFonts(
  layers: RuntimeLayer[],
  issues: ArtifactRuntimeCapabilityIssue[],
): ArtifactRuntimeUnresolvedFont[] {
  const unresolvedLayerIds = new Set(
    issues.flatMap((issue) => (issue.code === 'missing-font' && issue.layerId ? [issue.layerId] : [])),
  );
  const layerIdsByRef = new Map<string, string[]>();
  for (const layer of layers) {
    if (!unresolvedLayerIds.has(layer.id) || typeof layer.font !== 'string' || layer.font.length === 0) continue;
    const layerIds = layerIdsByRef.get(layer.font) ?? [];
    layerIds.push(layer.id);
    layerIdsByRef.set(layer.font, layerIds);
  }
  return [...layerIdsByRef].map(([ref, layerIds]) => ({ ref, layerIds }));
}

function capabilityStatus(
  issues: ArtifactRuntimeCapabilityIssue[],
  unresolvedFonts: ArtifactRuntimeUnresolvedFont[],
): ArtifactRuntimeCapabilityReport['status'] {
  if (issues.length === 0) return 'ready';
  const unresolvedLayerCount = unresolvedFonts.reduce((count, font) => count + font.layerIds.length, 0);
  if (
    unresolvedFonts.length > 0 &&
    unresolvedLayerCount === issues.length &&
    issues.every((issue) => issue.code === 'missing-font')
  ) {
    return 'unresolved-fonts';
  }
  return 'unsupported';
}

export function analyzeArtifactRuntimeProject(
  value: unknown,
  options: AnalyzeArtifactRuntimeProjectOptions = {},
): ArtifactRuntimeCapabilityReport {
  const project = parseArtifactRuntimeProject(value);
  const layers = project.document.layers.filter(isRuntimeLayer);
  const issues: ArtifactRuntimeCapabilityIssue[] = [];
  const layerIds = new Set(layers.map((layer) => layer.id));
  const layerOrder = project.document.graph
    ? getLinearGraphOrder(project.document.graph, layerIds, issues)
    : layers.map((layer) => layer.id);
  const requiredFonts = new Set<string>();

  for (const layer of layers) {
    reportLayerCapabilities(layer, options, requiredFonts, issues);
  }

  const unresolvedFonts = collectUnresolvedFonts(layers, issues);

  return {
    supported: issues.length === 0,
    status: capabilityStatus(issues, unresolvedFonts),
    mode: project.document.graph ? 'linear-graph' : 'stack',
    layerOrder,
    requiredFonts: [...requiredFonts],
    unresolvedFonts,
    issues,
  };
}

async function resolveImages(layers: RuntimeLayer[], cache: Map<string, HTMLImageElement>) {
  await Promise.all(
    layers.map(async (layer) => {
      if (layer.kind !== 'image' || typeof layer.src !== 'string' || cache.has(layer.src)) return;
      cache.set(layer.src, await loadRuntimeImage(layer.src));
    }),
  );
}

async function ensureFontLoaded(fontFamily: string, size: number) {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await document.fonts.load(`${Math.max(1, Math.round(size))}px ${fontFamily}`);
  } catch {
    // The host may provide a system stack that FontFaceSet cannot load explicitly.
  }
}

async function applyEffect(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: RuntimeLayer,
  seed: number,
  scale: number,
) {
  const effectSeed = seed + Number(layer.seedOffset ?? 0);
  applyGlitchEffect(context, width, height, layer, scale, lcg(effectSeed ^ 0x1a2b3c));
  applyScanlines(context, width, height, layer, scale);
  applyGrain(context, width, height, layer, effectSeed);
  const ca = Number(layer.ca ?? 0);
  if (ca > 0) {
    const imageData = context.getImageData(0, 0, width, height);
    applyChromaticAberration(imageData.data, width, height, Math.round(ca * scale));
    context.putImageData(imageData, 0, 0);
  }
  if (![layer.noiseWarp, layer.vortex, layer.tearAmt].some((value) => typeof value === 'number' && value > 0)) {
    return canvas;
  }
  const { buildArtifactGpuEffectFilters, gpuRenderToCanvas } = await import('./gpu.js');
  const filters = buildArtifactGpuEffectFilters(layer, effectSeed);
  if (filters.length === 0) return canvas;
  return await gpuRenderToCanvas({ filters, height, onUnavailable: 'throw', source: canvas, width });
}

interface RuntimeLayerRenderContext {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  fontOptions: AnalyzeArtifactRuntimeProjectOptions;
  height: number;
  imageCache: Map<string, HTMLImageElement>;
  report: ArtifactRuntimeCapabilityReport;
  scale: number;
  seed: number;
  width: number;
}

type RuntimeLayerRenderer = (
  layer: RuntimeLayer,
  render: RuntimeLayerRenderContext,
) => HTMLCanvasElement | void | Promise<HTMLCanvasElement | void>;

const RUNTIME_LAYER_RENDERERS: Readonly<Record<string, RuntimeLayerRenderer>> = {
  fill(layer, { context, height, width }) {
    drawFillLayer(context, width, height, layer);
  },
  emoji(layer, { context, height, scale, seed, width }) {
    drawEmojiLayer(context, width, height, layer, lcg((seed + Number(layer.seedOffset ?? 0)) ^ 0x7a8b9c), scale);
  },
  image(layer, { context, height, imageCache, width }) {
    drawImageLayer(context, width, height, layer, imageCache.get(String(layer.src)) ?? null);
  },
  async text(layer, render) {
    const { context, height, scale, width } = render;
    const family = fontFamilyForLayer(layer, render.fontOptions);
    if (!family) throw new ArtifactRuntimeUnsupportedError(render.report);
    await ensureFontLoaded(family, Number(layer.size ?? 64) * scale);
    drawTextLayer(context, width, height, layer, scale, family);
  },
  effect(layer, { canvas, context, height, scale, seed, width }) {
    return applyEffect(canvas, context, width, height, layer, seed, scale);
  },
};

async function renderRuntimeLayer(layer: RuntimeLayer, render: RuntimeLayerRenderContext) {
  const renderer = layer.visible === false ? undefined : RUNTIME_LAYER_RENDERERS[layer.kind];
  return (await renderer?.(layer, render)) ?? render.canvas;
}

function positiveDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Artifact Runtime requires positive render dimensions.');
  return Math.max(1, Math.round(value));
}

function createRenderCanvas(target: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const ownerDocument = target.ownerDocument ?? (typeof document === 'undefined' ? undefined : document);
  const canvas = ownerDocument?.createElement('canvas') ?? target;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function commitRenderCanvas(target: HTMLCanvasElement, rendered: HTMLCanvasElement, width: number, height: number) {
  if (target === rendered) return;
  const context = target.getContext('2d');
  if (!context) throw new Error('Artifact Runtime could not create a target 2D context.');
  target.width = width;
  target.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(rendered, 0, 0);
}

function orderLayers(project: ArtifactRuntimeProject, report: ArtifactRuntimeCapabilityReport): RuntimeLayer[] {
  const layers = project.document.layers.filter(isRuntimeLayer);
  const layersById = new Map(layers.map((layer) => [layer.id, layer]));
  return report.layerOrder.map((id) => layersById.get(id)).filter((layer): layer is RuntimeLayer => !!layer);
}

export async function renderArtifactRuntimeProject(
  options: RenderArtifactRuntimeProjectOptions,
): Promise<ArtifactRuntimeCapabilityReport> {
  const project: ArtifactRuntimeProject = parseArtifactRuntimeProject(options.project);
  const report = analyzeArtifactRuntimeProject(project, options);
  if (!report.supported) throw new ArtifactRuntimeUnsupportedError(report);
  const width = positiveDimension(options.width);
  const height = positiveDimension(options.height);
  const orderedLayers = orderLayers(project, report);
  const imageCache = new Map<string, HTMLImageElement>();
  await resolveImages(orderedLayers, imageCache);
  let renderCanvas = createRenderCanvas(options.canvas, width, height);
  const context = renderCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Artifact Runtime could not create a 2D context.');
  context.clearRect(0, 0, width, height);
  if (report.mode === 'stack' && typeof project.document.global.bg === 'string') {
    drawDocumentBackground(context, width, height, project.document.global.bg);
  }
  const scale = width / REFERENCE_SIZE;

  for (const layer of orderedLayers) {
    const layerContext = renderCanvas.getContext('2d', { willReadFrequently: true });
    if (!layerContext) throw new Error('Artifact Runtime could not create a 2D context.');
    renderCanvas = await renderRuntimeLayer(layer, {
      canvas: renderCanvas,
      context: layerContext,
      fontOptions: options,
      height,
      imageCache,
      report,
      scale,
      seed: project.document.global.seed,
      width,
    });
  }

  commitRenderCanvas(options.canvas, renderCanvas, width, height);

  return report;
}
