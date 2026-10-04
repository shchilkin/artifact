import { expect } from 'vitest';
import type { CanvasDocument } from '../../types/config';
import {
  buildGraphLayerTree,
  flattenGraphLayerTree,
  type GraphLayerTree,
  type GraphTreeRow,
} from '../../utils/graphLayerTree';
import { inferLinearGraph } from '../../utils/nodeGraph';
import { renderedNodeIds } from './graphReachFixtures';

// The Layers tree oracle shared by the tree builder and tree edit tests: the tree must list exactly
// the nodes the real renderer touches from Output, and every other node under "Not in output".

export function allNodeIds(doc: CanvasDocument): Set<string> {
  const graph = doc.graph!;
  return new Set([
    ...doc.layers.map((layer) => layer.id),
    ...[
      graph.mergeNodes,
      graph.colorNodes,
      graph.repeatNodes,
      graph.materialNodes,
      graph.maskNodes,
      graph.transformNodes,
      graph.grimeShadowNodes,
      graph.shaderNodes,
      graph.environmentNodes,
      graph.scene3dNodes,
    ].flatMap((nodes) => (nodes ?? []).map((node) => node.id)),
  ]);
}

/**
 * The nodes the real renderer touches when it renders Output. `readOnly` lists nodes the renderer reads
 * without rendering (Scene 3D models, material settings), which each fixture states by hand so the
 * oracle stays independent of the tree.
 */
export async function rendererReach(doc: CanvasDocument, readOnly: string[] = []): Promise<Set<string>> {
  const existing = allNodeIds(doc);
  const rendered = await renderedNodeIds(doc, doc.graph ?? inferLinearGraph(doc.layers));
  return new Set([...rendered, ...readOnly].filter((id) => existing.has(id)));
}

export function treeEntryIds(rows: GraphTreeRow[]) {
  return flattenGraphLayerTree(rows)
    .filter((row) => !row.reference)
    .map((row) => row.nodeId);
}

export function expectTreeMatchesRenderer(doc: CanvasDocument, tree: GraphLayerTree, reached: Set<string>) {
  const outputIds = treeEntryIds(tree.output);
  const detachedIds = tree.notInOutput.flatMap((stack) => treeEntryIds(stack));
  const allIds = [...outputIds, ...detachedIds];

  expect(new Set(outputIds)).toEqual(reached);
  expect(tree.reachedNodeIds).toEqual(reached);
  expect(new Set(detachedIds)).toEqual(new Set([...allNodeIds(doc)].filter((id) => !reached.has(id))));
  // Every node has exactly one full entry.
  expect(allIds.length).toBe(new Set(allIds).size);
}

/** Builds the tree for `doc` and checks it against the renderer. */
export async function expectDocumentTreeMatchesRenderer(doc: CanvasDocument, readOnly: string[] = []) {
  const tree = buildGraphLayerTree(doc);
  expectTreeMatchesRenderer(doc, tree, await rendererReach(doc, readOnly));
  return tree;
}
