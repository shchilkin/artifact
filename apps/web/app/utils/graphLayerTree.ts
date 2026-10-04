import type { CanvasDocument, CanvasGraph } from '../types/config';
import { EXPORT_NODE_ID, findGraphUtilityNode, graphUtilityNodeCollections, inferLinearGraph } from './nodeGraph';
import {
  collectGraphRenderReachModes,
  type GraphInputPort,
  type GraphInputRole,
  type GraphReachMode,
  type GraphRenderInput,
  type GraphRenderNodeKind,
  graphNodeRenderInputs,
  graphRenderNodeKind,
} from './render/graphInputs';

// Graph-derived Layers tree for custom graphs. Design: docs/layers-graph-tree.md.
// Rows are listed top-first: the node nearest Output is at the top of its stack.

export type GraphTreeNodeKind = Exclude<GraphRenderNodeKind, 'export' | 'missing'>;

/**
 * Nested children of a row:
 * - `group`: the merge `b` stack, shown inside the merge folder;
 * - `mask`: the clip-style mask stack;
 * - `pattern`: the repeat item ("Pattern source");
 * - `input`: one side input (Model, Material, Environment, a texture map), shown under "Inputs".
 */
export type GraphTreeGroupKind = 'group' | 'mask' | 'pattern' | 'input';

export interface GraphTreeGroup {
  /** Stable UI key, derived from the owning node id. Collapse state is keyed by it. */
  key: string;
  kind: GraphTreeGroupKind;
  port: GraphInputPort;
  label: string;
  rows: GraphTreeRow[];
}

export interface GraphTreeRow {
  /** Unique within the tree: the node id for the full entry, a path-derived key for references. */
  key: string;
  nodeId: string;
  kind: GraphTreeNodeKind;
  name: string;
  /** A use of a node whose full entry appears elsewhere; it has no children. */
  reference: boolean;
  groups: GraphTreeGroup[];
}

export interface GraphLayerTree {
  /** The stack that ends in Output, top-first. */
  output: GraphTreeRow[];
  /** Stacks that do not reach Output, each top-first. */
  notInOutput: GraphTreeRow[][];
  /** Existing nodes the renderer reaches from Output. */
  reachedNodeIds: Set<string>;
}

const INPUT_LABELS: Partial<Record<GraphInputPort, string>> = {
  model: 'Model',
  material: 'Material',
  env: 'Environment',
  albedo: 'Albedo',
  roughness: 'Roughness',
  metalness: 'Metalness',
  normal: 'Normal',
  alpha: 'Alpha',
};

type NestedInput = GraphRenderInput & { role: Exclude<GraphInputRole, 'primary'> };

function isNestedInput(input: GraphRenderInput): input is NestedInput {
  return input.role !== 'primary';
}

const GROUP_FOR_ROLE: Record<NestedInput['role'], { kind: GraphTreeGroupKind; label: string }> = {
  overlay: { kind: 'group', label: 'Group' },
  mask: { kind: 'mask', label: 'Mask' },
  pattern: { kind: 'pattern', label: 'Pattern source' },
  side: { kind: 'input', label: 'Input' },
};

const MODE_ORDER: GraphReachMode[] = ['render', 'material', 'read'];

/** Nodes outside Output are shown as if rendered; a material also shows its texture maps. */
function unreachedModes(context: TreeContext, nodeId: string): GraphReachMode[] {
  return treeNodeKind(context, nodeId) === 'material' ? ['render', 'material'] : ['render'];
}

interface TreeContext {
  doc: CanvasDocument;
  graph: CanvasGraph;
  reach: Map<string, Set<GraphReachMode>>;
  placed: Set<string>;
  inputsCache: Map<string, GraphRenderInput[]>;
}

function nodeName(doc: CanvasDocument, graph: CanvasGraph, nodeId: string, kind: GraphTreeNodeKind): string {
  const node =
    kind === 'layer' ? doc.layers.find((layer) => layer.id === nodeId) : findGraphUtilityNode(graph, nodeId)?.node;
  return node?.name ?? nodeId;
}

function treeNodeKind(context: TreeContext, nodeId: string): GraphTreeNodeKind | null {
  const kind = graphRenderNodeKind(context.doc, context.graph, nodeId);
  return kind === 'export' || kind === 'missing' ? null : kind;
}

function dedupeInputs(inputs: GraphRenderInput[]) {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const key = `${input.port}:${input.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Inputs to show under a row: those the renderer follows for every way the node is used. Only
 * `render` use has a primary stack, and it is listed first, so de-duplication keeps it primary.
 */
function rowInputs(context: TreeContext, nodeId: string): GraphRenderInput[] {
  const cached = context.inputsCache.get(nodeId);
  if (cached) return cached;
  const reached = context.reach.get(nodeId);
  const modes = reached ? MODE_ORDER.filter((mode) => reached.has(mode)) : unreachedModes(context, nodeId);
  const inputs = dedupeInputs(modes.flatMap((mode) => graphNodeRenderInputs(context.doc, context.graph, nodeId, mode)));
  context.inputsCache.set(nodeId, inputs);
  return inputs;
}

function referenceRow(context: TreeContext, nodeId: string, kind: GraphTreeNodeKind, path: string): GraphTreeRow {
  return {
    key: `ref:${path}:${nodeId}`,
    nodeId,
    kind,
    name: nodeName(context.doc, context.graph, nodeId, kind),
    reference: true,
    groups: [],
  };
}

function groupFor(ownerId: string, input: NestedInput, rows: GraphTreeRow[]): GraphTreeGroup {
  const { kind, label } = GROUP_FOR_ROLE[input.role];
  const suffix = kind === 'input' ? `:${input.port}` : '';
  return {
    key: `${ownerId}:${kind}${suffix}`,
    kind,
    port: input.port,
    label: kind === 'input' ? (INPUT_LABELS[input.port] ?? label) : label,
    rows,
  };
}

/**
 * Builds the stack that starts at `nodeId`, top-first. Depth-first in walk order: the primary
 * continuation is placed before this row's nested groups, so a shared node's full entry lands
 * where the walk first reaches it and every later use becomes a reference row.
 */
function buildStack(context: TreeContext, nodeId: string | null, path: string): GraphTreeRow[] {
  if (!nodeId) return [];
  const kind = treeNodeKind(context, nodeId);
  if (!kind) return [];
  if (context.placed.has(nodeId)) return [referenceRow(context, nodeId, kind, path)];
  context.placed.add(nodeId);

  const inputs = rowInputs(context, nodeId);
  const primary = inputs.find((input) => input.role === 'primary') ?? null;
  const below = buildStack(context, primary?.sourceId ?? null, `${nodeId}:${primary?.port ?? ''}`);
  const groups = inputs
    .filter(isNestedInput)
    .map((input) => groupFor(nodeId, input, buildStack(context, input.sourceId, `${nodeId}:${input.port}`)))
    .filter((group) => group.rows.length > 0);

  const row: GraphTreeRow = {
    key: nodeId,
    nodeId,
    kind,
    name: nodeName(context.doc, context.graph, nodeId, kind),
    reference: false,
    groups,
  };
  return [row, ...below];
}

function graphNodeIds(doc: CanvasDocument, graph: CanvasGraph): string[] {
  // Top-first, matching the Layers list: layers from the top of the stack, then graph-only nodes.
  const layerIds = [...doc.layers].reverse().map((layer) => layer.id);
  const utilityIds = graphUtilityNodeCollections(graph).flatMap((nodes) => nodes.map((node) => node.id));
  return [...new Set([...layerIds, ...utilityIds])];
}

function buildNotInOutput(context: TreeContext, unreached: string[]): GraphTreeRow[][] {
  const unreachedSet = new Set(unreached);
  const consumed = new Set<string>();
  for (const nodeId of unreached) {
    for (const input of rowInputs(context, nodeId)) {
      if (unreachedSet.has(input.sourceId) && input.sourceId !== nodeId) consumed.add(input.sourceId);
    }
  }
  const stacks: GraphTreeRow[][] = [];
  // Roots first; anything left over sits on a cycle and starts its own stack.
  const starts = [...unreached.filter((id) => !consumed.has(id)), ...unreached];
  for (const nodeId of starts) {
    if (context.placed.has(nodeId)) continue;
    stacks.push(buildStack(context, nodeId, 'detached'));
  }
  return stacks;
}

/** The graph a document renders through: its own graph, or the stack wired straight to Output. */
function documentGraph(doc: CanvasDocument): CanvasGraph {
  return doc.graph ?? inferLinearGraph(doc.layers);
}

/**
 * Derives the Layers tree from the document graph. Pure: it walks from `__export__.in` along the
 * inputs the renderer follows (`render/graphInputs.ts`), keeps a visited set so cycles and shared
 * nodes cannot loop, tolerates missing edges and nodes, and lists unreachable nodes separately.
 */
export function buildGraphLayerTree(doc: CanvasDocument): GraphLayerTree {
  const graph = documentGraph(doc);
  const reach = collectGraphRenderReachModes(doc, graph, EXPORT_NODE_ID);
  const context: TreeContext = { doc, graph, reach, placed: new Set(), inputsCache: new Map() };
  const output = buildStack(context, exportSource(context), EXPORT_NODE_ID);
  const reachedNodeIds = new Set(context.placed);
  const unreached = graphNodeIds(doc, graph).filter((id) => !context.placed.has(id));
  return { output, notInOutput: buildNotInOutput(context, unreached), reachedNodeIds };
}

function exportSource(context: TreeContext): string | null {
  return graphNodeRenderInputs(context.doc, context.graph, EXPORT_NODE_ID, 'render')[0]?.sourceId ?? null;
}

/** Every row in display order, depth-first, including nested groups. */
export function flattenGraphLayerTree(rows: GraphTreeRow[]): GraphTreeRow[] {
  return rows.flatMap((row) => [row, ...row.groups.flatMap((group) => flattenGraphLayerTree(group.rows))]);
}
