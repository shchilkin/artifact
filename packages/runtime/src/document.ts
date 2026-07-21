import { parseArtifactRuntimeProject } from './project.js';
import {
  applyChromaticAberration,
  applyGlitchEffect,
  applyGrain,
  applyScanlines,
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
  RenderArtifactRuntimeProjectOptions,
} from './types.js';

const EXPORT_NODE_ID = '__export__';
const REFERENCE_SIZE = 540;
const SUPPORTED_LAYER_KINDS = new Set(['effect', 'emoji', 'fill', 'image', 'text']);
const SUPPORTED_EFFECT_PRESETS = new Set(['ca', 'glitch', 'grain', 'scanlines']);
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
  visible?: boolean;
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

function reportUnsupportedGraphCollections(graph: ArtifactRuntimeGraph, issues: ArtifactRuntimeCapabilityIssue[]) {
  for (const collection of GRAPH_NODE_COLLECTIONS) {
    if ((graph[collection]?.length ?? 0) > 0) {
      issues.push({
        code: 'unsupported-graph-node',
        message: `Graph collection ${collection} is not supported by full-document alpha playback.`,
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

function reportEffectCapability(layer: RuntimeLayer, context: LayerCapabilityContext) {
  if (SUPPORTED_EFFECT_PRESETS.has(String(layer.preset))) return;
  context.issues.push({
    code: 'unsupported-effect',
    layerId: layer.id,
    message: `Effect ${String(layer.preset)} is not supported by full-document alpha playback.`,
  });
}

function reportImageCapability(layer: RuntimeLayer, context: LayerCapabilityContext) {
  if (typeof layer.src === 'string' && layer.src.length > 0) return;
  context.issues.push({ code: 'missing-image', layerId: layer.id, message: `Image layer ${layer.id} has no source.` });
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

  return {
    supported: issues.length === 0,
    mode: project.document.graph ? 'linear-graph' : 'stack',
    layerOrder,
    requiredFonts: [...requiredFonts],
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

function applyEffect(
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
  if (ca <= 0) return;
  const imageData = context.getImageData(0, 0, width, height);
  applyChromaticAberration(imageData.data, width, height, Math.round(ca * scale));
  context.putImageData(imageData, 0, 0);
}

interface RuntimeLayerRenderContext {
  context: CanvasRenderingContext2D;
  fontOptions: AnalyzeArtifactRuntimeProjectOptions;
  height: number;
  imageCache: Map<string, HTMLImageElement>;
  report: ArtifactRuntimeCapabilityReport;
  scale: number;
  seed: number;
  width: number;
}

type RuntimeLayerRenderer = (layer: RuntimeLayer, render: RuntimeLayerRenderContext) => void | Promise<void>;

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
  effect(layer, { context, height, scale, seed, width }) {
    applyEffect(context, width, height, layer, seed, scale);
  },
};

async function renderRuntimeLayer(layer: RuntimeLayer, render: RuntimeLayerRenderContext) {
  const renderer = layer.visible === false ? undefined : RUNTIME_LAYER_RENDERERS[layer.kind];
  await renderer?.(layer, render);
}

function positiveDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Artifact Runtime requires positive render dimensions.');
  return Math.max(1, Math.round(value));
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
  const context = options.canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Artifact Runtime could not create a 2D context.');
  options.canvas.width = width;
  options.canvas.height = height;
  context.clearRect(0, 0, width, height);

  const orderedLayers = orderLayers(project, report);
  const imageCache = options.imageCache ?? new Map<string, HTMLImageElement>();
  await resolveImages(orderedLayers, imageCache);
  const scale = width / REFERENCE_SIZE;

  for (const layer of orderedLayers) {
    await renderRuntimeLayer(layer, {
      context,
      fontOptions: options,
      height,
      imageCache,
      report,
      scale,
      seed: project.document.global.seed,
      width,
    });
  }

  return report;
}
