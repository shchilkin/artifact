import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../../types/config';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../types/config';
import { EXPORT_NODE_ID, type GraphUtilityNodeKind, graphUtilityNodeKind } from '../nodeGraph';

// Pure description of which inputs the graph renderer follows. The renderer (`graph.ts`) shares the
// port lookup below; the per-kind input tables restate what each `GRAPH_NODE_RENDERERS` entry reads,
// and `test-fixtures/render/graphReachFixtures.ts` renders fixtures for every branch so the two cannot drift apart
// unnoticed. When a renderer starts or stops reading a port, update the table in the same change.

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

export type GraphRenderNodeKind = 'export' | GraphUtilityNodeKind | 'layer' | 'missing';

/** Classifies a node id in the same order the renderer dispatches it (`GRAPH_NODE_RENDERERS`). */
export function graphRenderNodeKind(doc: CanvasDocument, graph: CanvasGraph, nodeId: string): GraphRenderNodeKind {
  if (nodeId === EXPORT_NODE_ID) return 'export';
  const utilityKind = graphUtilityNodeKind(graph, nodeId);
  if (utilityKind) return utilityKind;
  return doc.layers.some((layer) => layer.id === nodeId) ? 'layer' : 'missing';
}

/**
 * How the renderer uses a node:
 * - `render`: the node's pixels are rendered, so its own render inputs are followed;
 * - `material`: a material node on a `material` port: its settings are read and its texture ports rendered;
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

const TEXTURE_CANDIDATES: InputCandidate[] = MATERIAL_TEXTURE_INPUT_PORTS.map((port) => ({
  port,
  role: 'side',
  mode: 'render',
}));

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
      const layer = doc.layers.find((item) => item.id === nodeId);
      if (!layer) return [];
      const primary: InputCandidate = { port: graphLayerInputPort(layer), role: 'primary', mode: 'render' };
      return layer.kind === 'primitive' ? [primary, { port: 'material', role: 'side', mode: 'material' }] : [primary];
    }
    default:
      return [];
  }
}

function modeCandidates(doc: CanvasDocument, graph: CanvasGraph, nodeId: string, mode: GraphReachMode) {
  if (mode === 'read') return [];
  if (mode === 'material') return TEXTURE_CANDIDATES;
  return renderModeCandidates(doc, graph, nodeId);
}

function textureInputs(graph: CanvasGraph, nodeId: string): GraphRenderInput[] {
  return TEXTURE_CANDIDATES.flatMap((candidate) => {
    const sourceId = findIncomingSource(graph, nodeId, candidate.port);
    return sourceId ? [{ ...candidate, sourceId }] : [];
  });
}

/**
 * What a `material` port contributes, mirroring `resolveMaterialTextureCanvases` and the material
 * config lookups: a shader is rendered as the albedo; a material node's settings are read and its
 * texture ports rendered; any other node is neither rendered nor read, but whatever feeds its texture
 * ports still renders, so those sources count as the consumer's own inputs.
 */
function materialPortInputs(doc: CanvasDocument, graph: CanvasGraph, sourceId: string): GraphRenderInput[] {
  const kind = graphRenderNodeKind(doc, graph, sourceId);
  if (kind === 'shader') return [{ port: 'material', sourceId, role: 'side', mode: 'render' }];
  if (kind === 'material') return [{ port: 'material', sourceId, role: 'side', mode: 'material' }];
  return textureInputs(graph, sourceId);
}

function candidateInputs(
  doc: CanvasDocument,
  graph: CanvasGraph,
  candidate: InputCandidate,
  sourceId: string,
): GraphRenderInput[] {
  if (candidate.port === 'material') return materialPortInputs(doc, graph, sourceId);
  const mode =
    candidate.port === 'env'
      ? environmentPortMode(doc, graph, sourceId)
      : candidate.port === 'model'
        ? modelPortMode(doc, sourceId)
        : candidate.mode;
  return mode ? [{ port: candidate.port, sourceId, role: candidate.role, mode }] : [];
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
  return modeCandidates(doc, graph, nodeId, mode).flatMap((candidate) => {
    const sourceId = findIncomingSource(graph, nodeId, candidate.port);
    return sourceId ? candidateInputs(doc, graph, candidate, sourceId) : [];
  });
}

/**
 * The one reachability walk. Every node id the renderer touches when rendering `targetId` (Output by
 * default), with the ways it is used. Includes the target, and ids of edges that point at deleted
 * nodes; callers filter those.
 */
export function collectGraphRenderReachModes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  targetId: string = EXPORT_NODE_ID,
): Map<string, Set<GraphReachMode>> {
  const reach = new Map<string, Set<GraphReachMode>>();
  const queue: Array<{ id: string; mode: GraphReachMode }> = [{ id: targetId, mode: 'render' }];
  for (let next = queue.pop(); next; next = queue.pop()) {
    const { id, mode } = next;
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

/**
 * Every node that contributes to `targetId` when `renderGraphTarget` renders it, including the target:
 * the nodes it renders plus the nodes whose settings it reads. Edges on ports a renderer ignores, and
 * duplicate edges after the first on one port, do not count.
 */
export function collectGraphRenderReach(
  doc: CanvasDocument,
  graph: CanvasGraph,
  targetId: string = EXPORT_NODE_ID,
): Set<string> {
  return new Set(collectGraphRenderReachModes(doc, graph, targetId).keys());
}
