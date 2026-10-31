import { isRecord, type StoredDocument } from './shared';

/**
 * Per-kind node arrays of schema 5, in the order the renderer classified ids. A node whose id was already taken
 * by an earlier kind was unreachable before, so it is dropped.
 */
const NODE_ARRAYS = [
  ['mergeNodes', 'merge'],
  ['colorNodes', 'color'],
  ['repeatNodes', 'repeat'],
  ['materialNodes', 'material'],
  ['maskNodes', 'mask'],
  ['transformNodes', 'transform'],
  ['grimeShadowNodes', 'grimeShadow'],
  ['shaderNodes', 'shader'],
  ['environmentNodes', 'environment'],
  ['scene3dNodes', 'scene3d'],
] as const;

/**
 * Schema 5 -> 6: graph-only nodes move from one array per kind into `graph.nodes`, a map by id, and each node
 * records its `kind`.
 */
export function migrateV5ToV6(raw: StoredDocument): StoredDocument {
  if (!isRecord(raw.graph)) return { ...raw, schemaVersion: 6 };
  const graph = { ...raw.graph };
  const nodes: Record<string, unknown> = isRecord(graph.nodes) ? { ...graph.nodes } : {};
  for (const [field, kind] of NODE_ARRAYS) {
    const stored = graph[field];
    delete graph[field];
    if (!Array.isArray(stored)) continue;
    for (const node of stored) {
      if (!isRecord(node) || typeof node.id !== 'string' || node.id in nodes) continue;
      nodes[node.id] = { ...node, kind };
    }
  }
  return { ...raw, schemaVersion: 6, graph: { ...graph, nodes } };
}
