import { openProject, type WebSession } from '@artifact/core-web';
import {
  beginTransaction,
  cancelTransaction,
  commitTransaction,
  type SharedCommand,
  type SharedGraphAction,
  updateTransaction,
} from '@artifact/core-web/transactions';
import type { CanvasDocument, CanvasGraph, GraphEdge } from '../types/config';
import { deleteNodesFromDocument } from './documentCommands';
import type { DocumentUpdateMode } from './documentHistory';
import { assignNodesToGraphArea, splitEdgeWithNode } from './nodeGraph';

const SHARED_FIELDS: Record<string, ReadonlySet<string>> = {
  text: new Set([
    'name',
    'visible',
    'locked',
    'opacity',
    'content',
    'size',
    'color',
    'align',
    'font',
    'x',
    'y',
    'scaleX',
    'scaleY',
    'rotation',
  ]),
  image: new Set(['name', 'visible', 'locked', 'opacity', 'src', 'fit', 'x', 'y', 'scaleX', 'scaleY', 'rotation']),
  fill: new Set(['name', 'visible', 'locked', 'opacity', 'color']),
  emoji: new Set(['name', 'visible', 'locked', 'opacity', 'emojis', 'density', 'minSz', 'maxSz', 'seedOffset']),
  effect: new Set([
    'name',
    'visible',
    'locked',
    'glitch',
    'grain',
    'noiseWarp',
    'vortex',
    'tearAmt',
    'scanlines',
    'ca',
    'tearSize',
    'scanlineWidth',
  ]),
};
const BASE_FIELDS = new Set(['name', 'visible', 'locked', 'opacity']);
const SHARED_GRAPH_LISTS = [
  'mergeNodes',
  'colorNodes',
  'repeatNodes',
  'maskNodes',
  'transformNodes',
  'grimeShadowNodes',
] as const;
const GRAPH_LISTS = [
  ...SHARED_GRAPH_LISTS,
  'materialNodes',
  'scene3dNodes',
  'environmentNodes',
  'shaderNodes',
] as const;

type RecordValue = Record<string, unknown>;
type GraphNode = { id: string } & RecordValue;
const COLD_IMAGE_SOURCE_LENGTH = 512 * 1024;

function largeInlineImage(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length > COLD_IMAGE_SOURCE_LENGTH;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equal(value, b[index]))
    );
  }
  const left = a as RecordValue;
  const right = b as RecordValue;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key]))
  );
}

function changedFields(before: RecordValue, after: RecordValue): Array<[string, unknown, boolean]> {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !equal(before[key], after[key]))
    .map((key) => [key, after[key], Object.prototype.hasOwnProperty.call(after, key) && after[key] !== undefined]);
}

function graphCandidateWithRetainedValues(
  before: CanvasGraph | undefined,
  after: CanvasGraph | undefined,
): CanvasGraph | undefined {
  if (!before || !after) return after;
  const candidate = { ...after };
  for (const list of GRAPH_LISTS) {
    const prior = (before[list] ?? []) as GraphNode[];
    const next = (after[list] ?? []) as GraphNode[];
    if (next.length === 0) continue;
    const oldById = new Map(prior.map((node) => [node.id, node]));
    (candidate as RecordValue)[list] = next.map((node) => oldById.get(node.id) ?? node);
  }
  return candidate;
}

function structureChanged(before: CanvasDocument, after: CanvasDocument): boolean {
  return (
    !equal(
      before.layers.map((layer) => layer.id),
      after.layers.map((layer) => layer.id),
    ) ||
    GRAPH_LISTS.some(
      (list) =>
        !equal(
          (before.graph?.[list] ?? []).map((node) => node.id),
          (after.graph?.[list] ?? []).map((node) => node.id),
        ),
    )
  );
}

/** Match the bounded 2D node/port set accepted by the shared graph validator. */
function sharedNodeKind(doc: CanvasDocument, id: string): string | null {
  if (id === '__export__') return 'output';
  const layer = doc.layers.find((item) => item.id === id);
  if (layer)
    return ['text', 'image', 'fill', 'emoji', 'effect', 'noise', 'array', 'lineField'].includes(layer.kind)
      ? `layer:${layer.kind}`
      : null;
  for (const list of SHARED_GRAPH_LISTS) {
    if ((doc.graph?.[list] ?? []).some((node) => node.id === id)) return list.slice(0, -'Nodes'.length);
  }
  return null;
}

function sharedEdge(doc: CanvasDocument, edge: GraphEdge): boolean {
  const source = sharedNodeKind(doc, edge.fromId);
  const target = sharedNodeKind(doc, edge.toId);
  if (!source || !target) return false;
  const ports: Record<string, string[]> = {
    output: ['in'],
    color: ['in'],
    transform: ['in'],
    grimeShadow: ['in'],
    repeat: ['in', 'bg'],
    merge: ['a', 'b'],
    mask: ['in', 'mask'],
    'layer:effect': ['in'],
  };
  return (
    edge.fromPort === 'out' &&
    edge.fromId !== '__export__' &&
    (ports[target] ?? (target.startsWith('layer:') ? ['bg'] : [])).includes(edge.toPort)
  );
}

function duplicateGraphCommands(before: CanvasDocument, after: CanvasDocument): SharedGraphAction[] | null {
  if (!before.graph || !after.graph) return null;
  const oldIds = new Set(before.layers.map((layer) => layer.id));
  for (const list of SHARED_GRAPH_LISTS)
    for (const node of (before.graph[list] ?? []) as GraphNode[]) oldIds.add(node.id);
  const additions = [
    ...after.layers.map((layer) => layer.id),
    ...SHARED_GRAPH_LISTS.flatMap((list) => ((after.graph![list] ?? []) as GraphNode[]).map((node) => node.id)),
  ].filter((id) => !oldIds.has(id));
  if (additions.length !== 1) return null;
  const newId = additions[0];
  const position = after.graph.positions[newId];
  if (!position) return null;
  const baseGraph = {
    ...before.graph,
    positions: { ...before.graph.positions, [newId]: position },
  };
  for (const source of before.layers) {
    if (!sharedNodeKind(before, source.id)) continue;
    const layers = [...before.layers];
    layers.splice(layers.findIndex((layer) => layer.id === source.id) + 1, 0, {
      ...source,
      id: newId,
      name: `${source.name} copy`,
    });
    if (equal({ ...before, layers, graph: baseGraph }, after))
      return [
        { kind: 'duplicate_nodes', copies: [{ id: source.id, new_id: newId }] },
        { kind: 'set_positions', positions: { [newId]: position } },
      ];
  }
  for (const list of SHARED_GRAPH_LISTS) {
    const prior = (before.graph[list] ?? []) as GraphNode[];
    for (const source of prior) {
      const graph = {
        ...baseGraph,
        [list]: [...prior, { ...source, id: newId }],
      };
      if (equal({ ...before, graph }, after))
        return [
          {
            kind: 'duplicate_nodes',
            copies: [{ id: source.id, new_id: newId }],
          },
          { kind: 'set_positions', positions: { [newId]: position } },
        ];
    }
  }
  return null;
}

function insertAndSplitGraphCommands(before: CanvasDocument, after: CanvasDocument): SharedGraphAction[] | null {
  if (!before.graph || !after.graph || !equal(before.layers, after.layers)) return null;
  for (const list of SHARED_GRAPH_LISTS) {
    const prior = (before.graph[list] ?? []) as GraphNode[];
    const next = (after.graph[list] ?? []) as GraphNode[];
    if (next.length !== prior.length + 1 || !equal(next.slice(0, -1), prior)) continue;
    const node = next.at(-1)!;
    const position = after.graph.positions[node.id];
    if (!position || before.graph.positions[node.id]) continue;
    const insertedGraph = {
      ...before.graph,
      [list]: next,
      positions: { ...before.graph.positions, [node.id]: position },
    };
    for (const edge of before.graph.edges) {
      if (!sharedEdge(before, edge)) continue;
      const inputPort = after.graph.edges.find((item) => item.id === `${edge.id}__before`)?.toPort;
      if (!inputPort || !equal(splitEdgeWithNode(insertedGraph, edge.id, node.id, inputPort), after.graph)) continue;
      return [
        {
          kind: 'add_node',
          collection: list.slice(0, -'Nodes'.length) as Extract<SharedGraphAction, { kind: 'add_node' }>['collection'],
          node,
          position,
        },
        {
          kind: 'split_edge',
          id: edge.id,
          node_id: node.id,
          input_port: inputPort,
        },
      ];
    }
  }
  return null;
}

function graphAction(doc: CanvasDocument, candidateDoc: CanvasDocument): SharedGraphAction | null {
  const before = doc.graph!;
  const after = candidateDoc.graph!;
  const deletedIds = [
    ...doc.layers.map((layer) => layer.id).filter((id) => !candidateDoc.layers.some((item) => item.id === id)),
    ...SHARED_GRAPH_LISTS.flatMap((list) =>
      ((before[list] ?? []) as GraphNode[])
        .map((node) => node.id)
        .filter((id) => !((after[list] ?? []) as GraphNode[]).some((node) => node.id === id)),
    ),
  ];
  if (
    deletedIds.length &&
    deletedIds.every((id) => sharedNodeKind(doc, id)) &&
    before.edges.every(
      (edge) => (!deletedIds.includes(edge.fromId) && !deletedIds.includes(edge.toId)) || sharedEdge(doc, edge),
    ) &&
    equal(deleteNodesFromDocument(doc, deletedIds), candidateDoc)
  )
    return { kind: 'remove_nodes', ids: deletedIds };

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter((key) => !equal((before as RecordValue)[key], (after as RecordValue)[key]));
  for (const list of SHARED_GRAPH_LISTS) {
    if (!changed.includes(list)) continue;
    const prior = ((before as RecordValue)[list] ?? []) as GraphNode[];
    const next = ((after as RecordValue)[list] ?? []) as GraphNode[];
    const added = next.filter((node) => !prior.some((old) => old.id === node.id));
    const removed = prior.filter((node) => !next.some((current) => current.id === node.id));
    if (
      added.length === 1 &&
      removed.length === 0 &&
      changed.every((key) => key === list || key === 'positions') &&
      equal(
        prior,
        next.filter((node) => node.id !== added[0].id),
      ) &&
      Object.keys(after.positions).length === Object.keys(before.positions).length + 1 &&
      Object.entries(after.positions).every(
        ([id, position]) => id === added[0].id || equal(before.positions[id], position),
      ) &&
      after.positions[added[0].id]
    ) {
      const collection = list.slice(0, -'Nodes'.length) as Extract<
        SharedGraphAction,
        { kind: 'add_node' }
      >['collection'];
      return {
        kind: 'add_node',
        collection,
        node: added[0],
        position: after.positions[added[0].id],
      };
    }
  }
  if (changed.length !== 1) return null;
  const key = changed[0];
  if (key === 'positions') {
    const positions = Object.fromEntries(
      Object.entries(after.positions).filter(([id, value]) => !equal(before.positions[id], value)),
    );
    if (Object.keys(before.positions).some((id) => !(id in after.positions))) return null;
    if (Object.keys(positions).some((id) => !sharedNodeKind(doc, id))) return null;
    return { kind: 'set_positions', positions };
  }
  if (key === 'edges') {
    const removed = before.edges.filter((edge) => !after.edges.some((next) => next.id === edge.id));
    const added = after.edges.filter((edge) => !before.edges.some((old) => old.id === edge.id));
    const modified = after.edges.filter((edge) => before.edges.some((old) => old.id === edge.id && !equal(old, edge)));
    if (modified.length) return null;
    if (removed.length === 1 && added.length === 2 && sharedEdge(doc, removed[0])) {
      const inserted = added.find((edge) => edge.id === `${removed[0].id}__before`);
      if (
        inserted &&
        sharedNodeKind(doc, inserted.toId) &&
        equal(splitEdgeWithNode(before, removed[0].id, inserted.toId, inserted.toPort), after)
      )
        return {
          kind: 'split_edge',
          id: removed[0].id,
          node_id: inserted.toId,
          input_port: inserted.toPort,
        };
    }
    if (removed.length && added.length) return null;
    if (added.length === 1 && sharedEdge(doc, added[0])) return { kind: 'add_edge', edge: added[0] };
    if (removed.length && removed.every((edge) => sharedEdge(doc, edge)))
      return { kind: 'remove_edges', ids: removed.map((edge) => edge.id) };
    return null;
  }
  if (SHARED_GRAPH_LISTS.includes(key as (typeof SHARED_GRAPH_LISTS)[number])) {
    const prior = ((before as RecordValue)[key] ?? []) as GraphNode[];
    const next = ((after as RecordValue)[key] ?? []) as GraphNode[];
    if (
      prior.length !== next.length ||
      !equal(
        prior.map((node) => node.id),
        next.map((node) => node.id),
      )
    )
      return null;
    const edits = next.flatMap((node, index) =>
      changedFields(prior[index], node).map(([field, value, present]) => ({
        id: node.id,
        field,
        value,
        present,
      })),
    );
    if (edits.length === 0 || edits.some((edit) => !edit.present || edit.field === 'id')) return null;
    const ids = new Set(edits.map((edit) => edit.id));
    if (ids.size !== 1) return null;
    return {
      kind: 'patch_node',
      id: edits[0].id,
      patch: Object.fromEntries(edits.map((edit) => [edit.field, edit.value])),
    };
  }
  if (key === 'areas') {
    const prior = before.areas ?? [];
    const next = after.areas ?? [];
    const added = next.filter((area) => !prior.some((old) => old.id === area.id));
    const removed = prior.filter((area) => !next.some((newArea) => newArea.id === area.id));
    for (const area of prior) {
      const updated = next.find((item) => item.id === area.id);
      if (
        updated &&
        !equal(updated.nodeIds, area.nodeIds) &&
        updated.nodeIds.every((id) => sharedNodeKind(doc, id)) &&
        equal(assignNodesToGraphArea(before, area.id, updated.nodeIds), after)
      )
        return { kind: 'assign_area', id: area.id, node_ids: updated.nodeIds };
    }
    if (
      added.length === 1 &&
      removed.length === 0 &&
      next.at(-1)?.id === added[0].id &&
      equal(
        prior,
        next.filter((area) => area.id !== added[0].id),
      )
    )
      return { kind: 'add_area', area: added[0] };
    if (
      removed.length === 1 &&
      added.length === 0 &&
      equal(
        next,
        prior.filter((area) => area.id !== removed[0].id),
      )
    )
      return { kind: 'remove_area', id: removed[0].id };
    const edited = next.filter((area) => prior.some((old) => old.id === area.id && !equal(old, area)));
    if (
      edited.length === 1 &&
      !added.length &&
      !removed.length &&
      equal(
        prior.map((area) => area.id),
        next.map((area) => area.id),
      )
    ) {
      const old = prior.find((area) => area.id === edited[0].id)!;
      const fields = changedFields(old as RecordValue, edited[0] as RecordValue);
      if (fields.every(([field, , present]) => present && field !== 'id'))
        return {
          kind: 'patch_area',
          id: old.id,
          patch: Object.fromEntries(fields.map(([field, value]) => [field, value])),
        };
    }
  }
  return null;
}

/** Build an exact candidate projection. TS still owns unsupported editing rules; Rust owns the resulting transaction. */
export function documentCommands(before: CanvasDocument, after: CanvasDocument): SharedCommand[] {
  const commands: SharedCommand[] = [];
  for (const collection of ['fontAssets', 'modelAssets', 'envAssets'] as const) {
    if (!equal(before[collection], after[collection])) {
      if (!after[collection]) throw new Error(`Removing ${collection} requires an explicit document replacement`);
      commands.push({
        type: 'edit_assets',
        collection,
        replace: after[collection] as (Record<string, unknown> & {
          id: string;
        })[],
      });
    }
  }
  const global = changedFields(before.global as RecordValue, after.global as RecordValue);
  if (global.length)
    commands.push({
      type: 'patch_global',
      patch: Object.fromEntries(global.map(([field, value]) => [field, value])),
    });
  const exportFields = changedFields(before.export as RecordValue, after.export as RecordValue);
  if (exportFields.length) {
    const shared = exportFields.filter(([field, value]) => field !== 'target' || value === 'cover');
    if (shared.length)
      commands.push({
        type: 'patch_export',
        patch: Object.fromEntries(shared.map(([field, value]) => [field, value])),
      });
    if (exportFields.some(([field, value]) => field === 'target' && value === 'envmap'))
      commands.push({
        type: 'bridge',
        capability: 'web:export-envmap',
        target: { scope: 'export_field', field: 'target' },
        value: 'envmap',
      });
  }

  const duplicateCommands = duplicateGraphCommands(before, after);
  const insertAndSplitCommands = insertAndSplitGraphCommands(before, after);
  const typedGraphAction =
    before.graph && after.graph && !duplicateCommands && !insertAndSplitCommands ? graphAction(before, after) : null;
  const typedGraphCommands =
    duplicateCommands ?? insertAndSplitCommands ?? (typedGraphAction ? [typedGraphAction] : null);
  const structural =
    structureChanged(before, after) &&
    (!typedGraphCommands ||
      (typedGraphAction?.kind !== 'remove_nodes' &&
        !duplicateCommands &&
        !equal(
          before.layers.map((layer) => layer.id),
          after.layers.map((layer) => layer.id),
        )));
  if (structural) {
    const oldById = new Map(before.layers.map((layer) => [layer.id, layer]));
    const layers = after.layers.map((layer) => oldById.get(layer.id) ?? layer);
    const graph = graphCandidateWithRetainedValues(before.graph, after.graph);
    commands.push({
      type: 'bridge_structure',
      capability: 'web:structure',
      layers,
      graph: graph ? { present: true, value: graph } : { present: false },
    });
  }

  const beforeById = new Map(before.layers.map((layer) => [layer.id, layer]));
  for (const layer of after.layers) {
    const previous = beforeById.get(layer.id);
    if (!previous) continue;
    const fields = changedFields(previous as RecordValue, layer as RecordValue);
    const typed: RecordValue = {};
    const shared = SHARED_FIELDS[layer.kind] ?? BASE_FIELDS;
    for (const [field, value, present] of fields) {
      if (shared.has(field)) {
        if (!present) throw new Error(`Shared layer field ${field} cannot be removed`);
        typed[field] = value;
      } else {
        commands.push({
          type: 'bridge',
          capability: 'web:layer-property',
          target: { scope: 'layer_field', id: layer.id, field },
          ...(present ? { value } : { remove: true }),
        });
      }
    }
    if (largeInlineImage(typed.src)) {
      commands.push({ type: 'patch_layer', id: layer.id, patch: { src: typed.src } });
      delete typed.src;
    }
    if (Object.keys(typed).length) commands.push({ type: 'patch_layer', id: layer.id, patch: typed });
  }

  if (!equal(before.graph, after.graph)) {
    // The structural handoff may already contain edge/position changes. A graph
    // bridge completes retained node values and any remaining Web-only edits.
    if (structural) {
      commands.push({
        type: 'bridge',
        capability: 'web:graph',
        target: { scope: 'graph' },
        ...(after.graph ? { value: after.graph } : { remove: true }),
      });
    } else if (typedGraphCommands) {
      commands.push(...typedGraphCommands.map((action): SharedCommand => ({ type: 'graph', action })));
    } else {
      commands.push({
        type: 'bridge',
        capability: 'web:graph',
        target: { scope: 'graph' },
        ...(after.graph ? { value: after.graph } : { remove: true }),
      });
    }
  }
  return commands;
}

function packageSource(doc: CanvasDocument): string {
  return JSON.stringify({
    artifactPackage: 'project',
    manifest: {
      kind: 'artifact-project-package',
      version: 1,
      documentSchemaVersion: 3,
    },
    document: doc,
  });
}

/** The shared structural command owns simple stack mutations. Complex Web graph
 * insertion/reordering still enters the explicit cold structure bridge. */
export function simpleLayerCommand(before: CanvasDocument, after: CanvasDocument): SharedCommand | null {
  if (before.graph || after.graph) return null;
  const oldIds = before.layers.map((layer) => layer.id);
  const nextIds = after.layers.map((layer) => layer.id);
  if (nextIds.length === oldIds.length + 1) {
    const added = after.layers.filter((layer) => !oldIds.includes(layer.id));
    if (added.length !== 1 || !['text', 'image', 'fill', 'emoji', 'effect'].includes(added[0].kind)) return null;
    const id = added[0].id;
    const index = nextIds.indexOf(id);
    if (
      !equal(
        nextIds.filter((value) => value !== id),
        oldIds,
      )
    )
      return null;
    const previous = index > 0 ? nextIds[index - 1] : undefined;
    // The current shared add command appends when after_id is omitted.
    if (index === 0 && oldIds.length > 0) return null;
    return {
      type: 'add_layer',
      kind: added[0].kind as 'text' | 'image' | 'fill' | 'emoji' | 'effect',
      new_id: id,
      ...(previous ? { after_id: previous } : {}),
      ...(added[0].kind === 'image' ? { src: added[0].src } : {}),
    };
  }
  if (nextIds.length === oldIds.length - 1) {
    const removed = oldIds.filter((id) => !nextIds.includes(id));
    if (
      removed.length === 1 &&
      equal(
        oldIds.filter((id) => id !== removed[0]),
        nextIds,
      )
    )
      return { type: 'remove_layer', id: removed[0] };
  }
  if (nextIds.length === oldIds.length && !equal(nextIds, oldIds)) {
    const first = nextIds.findIndex((id, index) => id !== oldIds[index]);
    if (
      first >= 0 &&
      first + 1 < nextIds.length &&
      nextIds[first] === oldIds[first + 1] &&
      nextIds[first + 1] === oldIds[first] &&
      equal(nextIds.slice(first + 2), oldIds.slice(first + 2))
    )
      return { type: 'move_layer', id: oldIds[first], delta: 1 };
  }
  return null;
}

function sessionDocument(session: WebSession): CanvasDocument {
  return JSON.parse(session.export_json()).document as CanvasDocument;
}

export class SharedDocumentSession {
  private transactionId: number | null = null;
  private pendingTicks: SharedCommand[][] = [];
  private gestureTimer: ReturnType<typeof setTimeout> | null = null;
  private constructor(
    private session: WebSession,
    private current: CanvasDocument,
    private onAsyncError?: (error: Error, recovered: CanvasDocument) => void,
    private onHistoryChange?: () => void,
  ) {}

  static async open(
    doc: CanvasDocument,
    onAsyncError?: (error: Error, recovered: CanvasDocument) => void,
    onHistoryChange?: () => void,
  ): Promise<SharedDocumentSession> {
    const session = await openProject(packageSource(doc));
    return new SharedDocumentSession(session, doc, onAsyncError, onHistoryChange);
  }

  get document(): CanvasDocument {
    return this.current;
  }
  get canUndo(): boolean {
    return this.transactionId !== null || JSON.parse(this.session.summary_json()).canUndo;
  }
  get canRedo(): boolean {
    return this.transactionId === null && JSON.parse(this.session.summary_json()).canRedo;
  }
  get undoCount(): number {
    return JSON.parse(this.session.summary_json()).undoCount;
  }

  apply(candidate: CanvasDocument, mode: DocumentUpdateMode): CanvasDocument {
    if (candidate === this.current || equal(candidate, this.current)) return this.current;
    if (mode !== 'debounce') this.flush();
    const starter = simpleLayerCommand(this.current, candidate);
    let commands: SharedCommand[] = [];
    const ownsTransaction = this.transactionId === null;
    if (ownsTransaction) {
      const opened = beginTransaction(this.session, this.session.revision());
      if (!opened.ok || opened.transactionId === null)
        throw new Error(opened.error?.message ?? 'Could not begin document edit');
      this.transactionId = opened.transactionId;
      this.pendingTicks = [];
    }
    try {
      if (starter) {
        const started = updateTransaction(this.session, this.transactionId!, [starter]);
        if (!started.ok) throw new Error(started.error?.message ?? 'Shared layer edit was rejected');
        commands.push(starter);
      }
      const remaining = documentCommands(starter ? sessionDocument(this.session) : this.current, candidate);
      if (!starter && !remaining.length) throw new Error('Document changed outside shared command capabilities');
      commands = [...commands, ...remaining];
      for (const command of remaining) {
        // A portable image fallback can exceed the ordinary 1 MiB update
        // envelope. Rust permits a single cold structure command up to the
        // package bound; it remains part of this same user transaction.
        const result = updateTransaction(this.session, this.transactionId!, [command]);
        if (!result.ok) throw new Error(result.error?.message ?? 'Document edit was rejected');
      }
      if (!equal(sessionDocument(this.session), candidate))
        throw new Error('Shared command result differs from the Web document');
      this.pendingTicks.push(commands);
      this.current = candidate; // Keep unchanged layer/graph object references for existing selectors.
      if (mode === 'debounce') {
        if (this.gestureTimer) clearTimeout(this.gestureTimer);
        this.gestureTimer = setTimeout(() => {
          try {
            this.flush();
          } catch (error) {
            this.onAsyncError?.(error instanceof Error ? error : new Error('Could not save the edit'), this.current);
          }
        }, 400);
      } else {
        this.flush();
      }
      return this.current;
    } catch (error) {
      // An update error is atomic, but a successful update with a mismatching
      // result needs the earlier gesture ticks replayed after cancellation.
      if (this.transactionId !== null) {
        cancelTransaction(this.session, this.transactionId);
        this.transactionId = null;
      }
      if (this.pendingTicks.length) {
        const reopened = beginTransaction(this.session, this.session.revision());
        if (!reopened.ok || reopened.transactionId === null)
          throw new Error('Could not restore the active gesture', {
            cause: error,
          });
        this.transactionId = reopened.transactionId;
        for (const tick of this.pendingTicks) {
          for (const command of tick) {
            const replayed = updateTransaction(this.session, this.transactionId, [command]);
            if (!replayed.ok)
              throw new Error('Could not restore the active gesture', {
                cause: error,
              });
          }
        }
      }
      if (ownsTransaction) this.pendingTicks = [];
      throw error;
    }
  }

  /** Explicit New/Open/Random is one undoable replacement, including root
   * assets and unknown metadata. No second TypeScript history is retained. */
  replace(candidate: CanvasDocument): CanvasDocument {
    if (equal(candidate, this.current)) return this.current;
    this.flush();
    const opened = beginTransaction(this.session, this.session.revision());
    if (!opened.ok || opened.transactionId === null)
      throw new Error(opened.error?.message ?? 'Could not begin document replacement');
    try {
      const changed = updateTransaction(this.session, opened.transactionId, [
        { type: 'replace_document', document: candidate },
      ]);
      if (!changed.ok) throw new Error(changed.error?.message ?? 'Document replacement was rejected');
      if (!equal(sessionDocument(this.session), candidate))
        throw new Error('Shared document replacement differs from the Web document');
      const committed = commitTransaction(this.session, opened.transactionId);
      if (!committed.ok) throw new Error(committed.error?.message ?? 'Could not commit document replacement');
      this.current = candidate;
      return candidate;
    } catch (error) {
      cancelTransaction(this.session, opened.transactionId);
      throw error;
    }
  }

  flush(): void {
    if (this.gestureTimer) clearTimeout(this.gestureTimer);
    this.gestureTimer = null;
    if (this.transactionId === null) return;
    const transactionId = this.transactionId;
    const result = commitTransaction(this.session, transactionId);
    this.transactionId = null;
    this.pendingTicks = [];
    if (!result.ok) {
      cancelTransaction(this.session, transactionId);
      this.current = sessionDocument(this.session);
      throw new Error(result.error?.message ?? 'Could not commit document edit');
    }
    this.onHistoryChange?.();
  }

  undo(): CanvasDocument | null {
    this.flush();
    if (!this.session.undo()) return null;
    this.current = sessionDocument(this.session);
    return this.current;
  }

  redo(): CanvasDocument | null {
    this.flush();
    if (!this.session.redo()) return null;
    this.current = sessionDocument(this.session);
    return this.current;
  }

  dispose(): void {
    try {
      this.flush();
    } catch (error) {
      this.onAsyncError?.(error instanceof Error ? error : new Error('Could not save the edit'), this.current);
    } finally {
      this.session.free();
    }
  }
}
