import type { CanvasDocument, CanvasGraph, GraphEdge, Layer, MaterialTextureInputPort } from '../../types/config';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../types/config';
import { EXPORT_NODE_ID } from '../nodeGraph';

// Pure description of which inputs the graph renderer follows. `graph.ts` and the Layers tree
// (`utils/graphLayerTree.ts`) both read the graph through these helpers so they cannot drift apart.

export type GraphInputPort = GraphEdge['toPort'];

/** The renderer's port lookup: when several edges feed one port, the first edge in `graph.edges` wins. */
export function findIncomingSource(graph: CanvasGraph, toId: string, toPort: GraphInputPort): string | null {
  const edge = graph.edges.find((item) => item.toId === toId && item.toPort === toPort);
  return edge?.fromId ?? null;
}

/** The port a layer node composites over: effects process `in`, every other layer draws over `bg`. */
export function graphLayerInputPort(layer: Layer): 'in' | 'bg' {
  return layer.kind === 'effect' ? 'in' : 'bg';
}

export type GraphRenderNodeKind =
  | 'export'
  | 'merge'
  | 'color'
  | 'repeat'
  | 'material'
  | 'mask'
  | 'transform'
  | 'grimeShadow'
  | 'shader'
  | 'environment'
  | 'scene3d'
  | 'layer'
  | 'missing';

function hasNode(nodes: Array<{ id: string }> | undefined, nodeId: string) {
  return (nodes ?? []).some((node) => node.id === nodeId);
}

/** Classifies a node id in the same order the renderer dispatches it (`GRAPH_NODE_RENDERERS`). */
export function graphRenderNodeKind(doc: CanvasDocument, graph: CanvasGraph, nodeId: string): GraphRenderNodeKind {
  if (nodeId === EXPORT_NODE_ID) return 'export';
  if (hasNode(graph.mergeNodes, nodeId)) return 'merge';
  if (hasNode(graph.colorNodes, nodeId)) return 'color';
  if (hasNode(graph.repeatNodes, nodeId)) return 'repeat';
  if (hasNode(graph.materialNodes, nodeId)) return 'material';
  if (hasNode(graph.maskNodes, nodeId)) return 'mask';
  if (hasNode(graph.transformNodes, nodeId)) return 'transform';
  if (hasNode(graph.grimeShadowNodes, nodeId)) return 'grimeShadow';
  if (hasNode(graph.shaderNodes, nodeId)) return 'shader';
  if (hasNode(graph.environmentNodes, nodeId)) return 'environment';
  if (hasNode(graph.scene3dNodes, nodeId)) return 'scene3d';
  return hasNode(doc.layers, nodeId) ? 'layer' : 'missing';
}

/**
 * How the renderer uses a node:
 * - `render`: the node's pixels are rendered, so its own render inputs are followed;
 * - `material`: the node feeds a `material` port, so its texture ports are rendered instead;
 * - `read`: the renderer reads the node's settings without rendering it (a Scene 3D model, or an
 *   environment node without a source), so none of its inputs are followed.
 */
export type GraphReachMode = 'render' | 'material' | 'read';

/**
 * What an input means to its consumer:
 * - `primary`: the stack the node continues (`in`, `bg`, merge `a`, a standalone material's albedo);
 * - `overlay`: the merge `b` stack;
 * - `mask`: the mask node's `mask` source;
 * - `pattern`: the repeat item on `in`;
 * - `side`: Scene 3D model/material/environment, primitive material, material texture maps.
 */
export type GraphInputRole = 'primary' | 'overlay' | 'mask' | 'pattern' | 'side';

export interface GraphRenderInput {
  port: GraphInputPort;
  sourceId: string;
  role: GraphInputRole;
  mode: GraphReachMode;
}

type InputCandidate = { port: GraphInputPort; role: GraphInputRole; mode: GraphReachMode };

function materialPortMode(doc: CanvasDocument, graph: CanvasGraph, sourceId: string): GraphReachMode {
  // A shader on a material port is rendered as the albedo texture; anything else contributes its texture ports.
  return graphRenderNodeKind(doc, graph, sourceId) === 'shader' ? 'render' : 'material';
}

function environmentPortMode(doc: CanvasDocument, graph: CanvasGraph, sourceId: string): GraphReachMode {
  if (graphRenderNodeKind(doc, graph, sourceId) !== 'environment') return 'render';
  return findIncomingSource(graph, sourceId, 'in') ? 'render' : 'read';
}

function modelPortMode(doc: CanvasDocument, sourceId: string): GraphReachMode | null {
  const layer = doc.layers.find((item) => item.id === sourceId);
  return layer?.kind === 'model' || layer?.kind === 'primitive' ? 'read' : null;
}

function shaderFollowsBackdrop(graph: CanvasGraph, nodeId: string) {
  const shader = (graph.shaderNodes ?? []).find((node) => node.id === nodeId);
  if (!shader) return false;
  if (shader.shaderKind === 'customCode' || shader.shaderKind === 'aiShader') return shader.role === 'effect';
  return shader.role !== 'fill';
}

function textureCandidates(role: (port: MaterialTextureInputPort) => GraphInputRole): InputCandidate[] {
  return MATERIAL_TEXTURE_INPUT_PORTS.map((port) => ({ port, role: role(port), mode: 'render' as const }));
}

const SINGLE_INPUT: InputCandidate[] = [{ port: 'in', role: 'primary', mode: 'render' }];

function renderModeCandidates(doc: CanvasDocument, graph: CanvasGraph, nodeId: string): InputCandidate[] {
  switch (graphRenderNodeKind(doc, graph, nodeId)) {
    case 'export':
    case 'color':
    case 'transform':
    case 'grimeShadow':
    case 'environment':
      return SINGLE_INPUT;
    case 'merge':
      return [
        { port: 'a', role: 'primary', mode: 'render' },
        { port: 'b', role: 'overlay', mode: 'render' },
      ];
    case 'mask':
      return [
        { port: 'in', role: 'primary', mode: 'render' },
        { port: 'mask', role: 'mask', mode: 'render' },
      ];
    case 'repeat':
      return [
        { port: 'bg', role: 'primary', mode: 'render' },
        { port: 'in', role: 'pattern', mode: 'render' },
      ];
    case 'material':
      return [{ port: 'albedo', role: 'primary', mode: 'render' }];
    case 'shader':
      return shaderFollowsBackdrop(graph, nodeId) ? [{ port: 'bg', role: 'primary', mode: 'render' }] : [];
    case 'scene3d':
      return [
        { port: 'bg', role: 'primary', mode: 'render' },
        { port: 'model', role: 'side', mode: 'read' },
        { port: 'material', role: 'side', mode: 'material' },
        { port: 'env', role: 'side', mode: 'render' },
      ];
    case 'layer': {
      const layer = doc.layers.find((item) => item.id === nodeId)!;
      const primary: InputCandidate = { port: graphLayerInputPort(layer), role: 'primary', mode: 'render' };
      return layer.kind === 'primitive' ? [primary, { port: 'material', role: 'side', mode: 'material' }] : [primary];
    }
    default:
      return [];
  }
}

function modeCandidates(doc: CanvasDocument, graph: CanvasGraph, nodeId: string, mode: GraphReachMode) {
  if (mode === 'read') return [];
  if (mode === 'material') return textureCandidates(() => 'side');
  return renderModeCandidates(doc, graph, nodeId);
}

function resolveCandidateMode(
  doc: CanvasDocument,
  graph: CanvasGraph,
  candidate: InputCandidate,
  sourceId: string,
): GraphReachMode | null {
  if (candidate.port === 'material') return materialPortMode(doc, graph, sourceId);
  if (candidate.port === 'env') return environmentPortMode(doc, graph, sourceId);
  if (candidate.port === 'model') return modelPortMode(doc, sourceId);
  return candidate.mode;
}

/**
 * The inputs the renderer follows for one node used in `mode`, in walk order: the primary stack
 * first, then the merge `b` stack, the mask, the repeat item, and side inputs.
 */
export function graphNodeRenderInputs(
  doc: CanvasDocument,
  graph: CanvasGraph,
  nodeId: string,
  mode: GraphReachMode,
): GraphRenderInput[] {
  const inputs: GraphRenderInput[] = [];
  for (const candidate of modeCandidates(doc, graph, nodeId, mode)) {
    const sourceId = findIncomingSource(graph, nodeId, candidate.port);
    if (!sourceId) continue;
    const sourceMode = resolveCandidateMode(doc, graph, candidate, sourceId);
    if (sourceMode) inputs.push({ port: candidate.port, sourceId, role: candidate.role, mode: sourceMode });
  }
  return inputs;
}

/**
 * Every node id the renderer touches when rendering `targetId` (Output by default), with the
 * ways it is used. Ids of edges that point at deleted nodes are included; callers filter them.
 */
export function collectGraphRenderReach(
  doc: CanvasDocument,
  graph: CanvasGraph,
  targetId: string = EXPORT_NODE_ID,
): Map<string, Set<GraphReachMode>> {
  const reach = new Map<string, Set<GraphReachMode>>();
  const queue: Array<{ id: string; mode: GraphReachMode }> = [{ id: targetId, mode: 'render' }];
  while (queue.length > 0) {
    const { id, mode } = queue.pop()!;
    const modes = reach.get(id) ?? new Set<GraphReachMode>();
    if (modes.has(mode)) continue;
    modes.add(mode);
    reach.set(id, modes);
    for (const input of graphNodeRenderInputs(doc, graph, id, mode)) {
      queue.push({ id: input.sourceId, mode: input.mode });
    }
  }
  return reach;
}
