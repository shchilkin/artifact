import type { CanvasDocument, CanvasGraph, Layer, PrimitiveViewportStateConfig } from '../types/config';
import { hashString } from './hashString';
import { imageCacheSignature } from './imageCacheSignature';
import { EXPORT_NODE_ID } from './nodeGraph';
import type { GraphRenderCache } from './renderer';
import {
  colorNodeRenderSig,
  edgeRenderSig,
  environmentNodeRenderSig,
  grimeShadowNodeRenderSig,
  layerRenderSig,
  maskNodeRenderSig,
  materialNodeRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
  scene3DNodeRenderSig,
  shaderNodeRenderSig,
  transformNodeRenderSig,
} from './renderSignature';

const GRAPH_NODE_RENDER_CACHE_LIMIT = 192;
let sessionCounter = 0;

interface GraphNodeRenderCacheConfig {
  width: number;
  height: number;
  effectResolution?: { width: number; height: number };
  primitiveViewStates?: Record<string, PrimitiveViewportStateConfig>;
  limit?: number;
}

function viewSignature(view: PrimitiveViewportStateConfig | undefined) {
  return view ? `${view.rotationX},${view.rotationY},${view.zoom},${view.panX},${view.panY}` : 'default';
}

function graphNodeSignatures(graph: CanvasGraph) {
  const signatures = new Map<string, string>();
  const add = <T extends { id: string }>(kind: string, nodes: T[] | undefined, signature: (node: T) => string) => {
    for (const node of nodes ?? []) signatures.set(node.id, `${kind}:${signature(node)}`);
  };
  add('merge', graph.mergeNodes, mergeNodeRenderSig);
  add('color', graph.colorNodes, colorNodeRenderSig);
  add('repeat', graph.repeatNodes, repeatNodeRenderSig);
  add('material', graph.materialNodes, materialNodeRenderSig);
  add('mask', graph.maskNodes, maskNodeRenderSig);
  add('transform', graph.transformNodes, transformNodeRenderSig);
  add('grimeShadow', graph.grimeShadowNodes, grimeShadowNodeRenderSig);
  add('scene3d', graph.scene3dNodes, scene3DNodeRenderSig);
  add('environment', graph.environmentNodes, environmentNodeRenderSig);
  add('shader', graph.shaderNodes, shaderNodeRenderSig);
  return signatures;
}

/** Two 32-bit hashes, so keys that live across edits are very unlikely to collide. */
function contentHash(value: string) {
  return `${hashString(value)}.${hashString(`${value.length}:${value}`)}`;
}

function layerSignature(layer: Layer, imageCache: Map<string, HTMLImageElement>) {
  const imageSig = layer.kind === 'image' ? imageCacheSignature([layer], imageCache) : '';
  return `layer:${layerRenderSig(layer)}|image:${imageSig}`;
}

/**
 * Content-addressed render cache for graph previews. A node's key hashes its own render signature with the keys of
 * every node feeding it, so an edit invalidates exactly the edited node and what is downstream of it: unchanged
 * upstream branches are reused across edits instead of being rendered again. The namespace carries the inputs
 * every node shares (render size, effect resolution, seed, background, aspect).
 */
export function createGraphNodeRenderCache(
  doc: CanvasDocument,
  graph: CanvasGraph,
  imageCache: Map<string, HTMLImageElement>,
  entries: Map<string, Promise<HTMLCanvasElement>>,
  config: GraphNodeRenderCacheConfig,
): GraphRenderCache {
  const layers = new Map(doc.layers.map((layer) => [layer.id, layer]));
  const graphSignatures = graphNodeSignatures(graph);
  const keys = new Map<string, string | null>();
  const visiting = new Set<string>();
  const session = `session-${(sessionCounter += 1)}`;

  function ownSignature(nodeId: string): string | null {
    const view = `view:${viewSignature(config.primitiveViewStates?.[nodeId])}/${viewSignature(graph.primitiveViewStates?.[nodeId])}`;
    const layer = layers.get(nodeId);
    if (layer) return `${nodeId}|${layerSignature(layer, imageCache)}|${view}`;
    const graphSignature = graphSignatures.get(nodeId);
    if (graphSignature) return `${nodeId}|${graphSignature}|${view}`;
    if (nodeId === EXPORT_NODE_ID) return `${nodeId}|export:${JSON.stringify(doc.export ?? null)}`;
    return null;
  }

  // A node without a stable content key (unknown kind, cycle, or such an input) is cached for this render only.
  const uncachedKey = (nodeId: string) => `${session}:${nodeId}`;

  function contentKey(nodeId: string): string | null {
    if (keys.has(nodeId)) return keys.get(nodeId) ?? null;
    if (visiting.has(nodeId)) return null;
    const own = ownSignature(nodeId);
    if (own === null) {
      keys.set(nodeId, null);
      return null;
    }
    visiting.add(nodeId);
    const inputs: string[] = [];
    let resolvable = true;
    for (const edge of graph.edges) {
      if (edge.toId !== nodeId) continue;
      const fromKey = contentKey(edge.fromId);
      if (fromKey === null) resolvable = false;
      inputs.push(`${edgeRenderSig(edge)}=${fromKey}`);
    }
    visiting.delete(nodeId);
    const key = resolvable ? `node:${contentHash(`${own}|in:${inputs.sort().join(',')}`)}` : null;
    keys.set(nodeId, key);
    return key;
  }

  return {
    namespace: [
      'graph-node',
      `${config.width}x${config.height}`,
      config.effectResolution
        ? `effect:${config.effectResolution.width}x${config.effectResolution.height}`
        : 'effect:auto',
      `seed:${doc.global.seed}`,
      `bg:${doc.global.bg}`,
      `aspect:${doc.global.aspect}`,
    ].join('|'),
    entries,
    entryKey: (nodeId) => contentKey(nodeId) ?? uncachedKey(nodeId),
    limit: config.limit ?? GRAPH_NODE_RENDER_CACHE_LIMIT,
  };
}
