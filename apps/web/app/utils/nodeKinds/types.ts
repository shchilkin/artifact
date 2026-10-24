import type { CanvasGraph, GraphEdge } from '../../types/config';

export type GraphInputPort = GraphEdge['toPort'];

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

/** One input port the renderer follows when it renders a node. */
export interface GraphNodeInput {
  port: GraphInputPort;
  role: GraphInputRole;
  mode: GraphReachMode;
}

/** Fields every graph-only node has. */
export interface GraphNodeBase<K extends string> {
  kind: K;
  id: string;
  name: string;
}

/**
 * The document-model half of a graph node kind: everything that is pure data and safe to load on any route.
 * Rendering lives in `utils/render/nodeKinds/` and editor UI in `components/node-canvas/nodeKinds/`.
 */
export interface GraphNodeKindModel<N extends GraphNodeBase<string>> {
  kind: N['kind'];
  /** Kind name shown in inspectors and summaries. */
  label: string;
  /** One-sentence description of what the node does. */
  description: string;
  /** New node with defaults; `partial` overrides them. */
  make(partial?: Partial<Omit<N, 'kind'>>): N;
  /** A stored node from any schema-6 document, with defaults filled for fields added since it was saved. */
  normalize(stored: Record<string, unknown> & { id: string }): N;
  /** Ports the renderer follows when it renders this node, in priority order. */
  inputs(node: N): readonly GraphNodeInput[];
  /** Every field that changes the node's pixels, for render caches and thumbnails. */
  renderSignature(node: N): string;
  /** How a new node joins the connection it is dropped on (see `GraphNodeInsertion`). */
  insertion(node: N): GraphNodeInsertion;
  /** Graph changes that must follow a patch to this node, if any. */
  afterUpdate?(graph: CanvasGraph, node: N, patch: Partial<N>): CanvasGraph;
  /** How the editor shows the kind. Plain data, so it is safe on any route. */
  look: GraphNodeLook;
  /** How Add Library offers and describes the kind. */
  library: GraphNodeLibrary;
}

export interface GraphNodeLook {
  /** Symbol on the node canvas card. */
  canvasSymbol: string;
  /** Accent color token of the node card. */
  accent: string;
  /** Stroke of edges leaving the node; the default edge stroke when absent. */
  edgeColor?: string;
  /** Icon and short label of the node's row in the Layers panel. */
  layersIcon: string;
  layersLabel: string;
  /** False when the node has no row inside a Layers area. */
  inLayerAreas?: false;
}

/** Add Library sections a kind is listed under. */
export type GraphNodeLibraryIntent = 'sources' | 'structure' | 'color' | 'threeD';

export interface GraphNodeLibrary {
  intent: GraphNodeLibraryIntent;
  /** Node kind whose accent the library card uses. */
  colorKind: string;
  /** Short result line, e.g. "Adds mask node". */
  resultLabel: string;
  /** The kind's single library entry; kinds with preset catalogs (material, shader) list theirs separately. */
  entry?: GraphNodeLibraryEntry;
}

export interface GraphNodeLibraryEntry {
  label: string;
  symbol: string;
  description: string;
  group: 'utility' | 'primitive';
  surfaces: Array<'layers' | 'nodes'>;
  tags: string[];
  keywords: string;
}

/**
 * How a new node joins a connection:
 * - `{ through }`: the connection's source feeds the node's `through` port and the node feeds the target;
 * - `source`: the node replaces the connection's source (fill shaders);
 * - `material`: the node only connects when dropped on a `material` port.
 */
export type GraphNodeInsertion = { through: GraphInputPort } | 'source' | 'material';

let idCounter = 0;

/** Unique id for a new node: `<prefix>-<timestamp>-<counter>`. */
export function newGraphNodeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const SINGLE_INPUT: readonly GraphNodeInput[] = [{ port: 'in', role: 'primary', mode: 'render' }];

/** A stored node that may be missing fields added after it was saved. */
export function withDefaults<N>(
  defaults: Partial<Omit<N, 'id' | 'name' | 'kind'>>,
  stored: Record<string, unknown>,
): N {
  return { ...defaults, ...stored } as N;
}
