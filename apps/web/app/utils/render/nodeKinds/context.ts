import type {
  CanvasDocument,
  CanvasGraph,
  Layer,
  MaterialConfig,
  MaterialTextureInputPort,
} from '../../../types/config';
import { DEFAULT_MATERIAL_CONFIG, MATERIAL_TEXTURE_INPUT_PORTS } from '../../../types/config';
import type { SceneMaterialTextureCanvases } from '../../modelRenderer';
import { findGraphNodeOfKind } from '../../nodeGraph';
import { createCanvas } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import type { RenderOptions } from '../layers';

export type RenderDependency = (
  dependencyId: string,
  size?: { width: number; height: number },
) => Promise<HTMLCanvasElement>;

export interface GraphNodeRenderContext {
  doc: CanvasDocument;
  graph: CanvasGraph;
  W: number;
  H: number;
  imageCache: Map<string, HTMLImageElement>;
  options: RenderOptions;
  renderDependency: RenderDependency;
}

export function throwIfRenderAborted(options: RenderOptions): void {
  if (!options.signal?.aborted) return;
  const error = new Error('Render aborted');
  error.name = 'AbortError';
  throw error;
}

export async function renderSingleInputSource(nodeId: string, context: GraphNodeRenderContext) {
  const sourceId = findIncomingSource(context.graph, nodeId, 'in');
  const source = sourceId ? await context.renderDependency(sourceId) : createCanvas(context.W, context.H);
  throwIfRenderAborted(context.options);
  return source;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function findLayer(doc: CanvasDocument, nodeId: string): Layer | undefined {
  return doc.layers.find((layer) => layer.id === nodeId);
}

export function shaderMaterialConfig(sourceId: string): MaterialConfig {
  return {
    ...DEFAULT_MATERIAL_CONFIG,
    materialPreset: 'matte',
    materialBaseColor: '#ffffff',
    materialAccentColor: '#ffffff',
    materialRoughness: 0.32,
    materialGrain: 0,
    materialRelief: 0,
    materialAlbedoName: sourceId,
  };
}

export async function resolveMaterialTextureCanvases(
  materialId: string,
  context: GraphNodeRenderContext,
): Promise<SceneMaterialTextureCanvases | null> {
  if (findGraphNodeOfKind(context.graph, 'shader', materialId)) {
    return { albedo: await context.renderDependency(materialId, { width: 512, height: 512 }) };
  }
  const textures: SceneMaterialTextureCanvases = {};
  let hasTexture = false;
  for (const port of MATERIAL_TEXTURE_INPUT_PORTS) {
    const sourceId = findIncomingSource(context.graph, materialId, port);
    if (!sourceId) continue;
    textures[materialTextureKey(port)] = await context.renderDependency(sourceId);
    hasTexture = true;
  }
  return hasTexture ? textures : null;
}

export function materialTextureKey(port: MaterialTextureInputPort): keyof SceneMaterialTextureCanvases {
  return port;
}
