import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync, WebSession } from '../../../../packages/artifact-core-web/generated/artifact_wasm';
import {
  beginTransaction,
  commitTransaction,
  graphPlan,
  type SharedGraphAction,
  updateTransaction,
} from '../../../../packages/artifact-core-web/src/transactions';
import type { CanvasDocument } from '../types/config';
import { deleteNodesFromDocument, duplicateLayerInDocument } from './documentCommands';
import {
  addGraphArea,
  addGraphEdge,
  assignNodesToGraphArea,
  collectDownstreamNodeIds,
  connectedPortIds,
  removeGraphEdge,
  resolveOutputPath,
  resolveRenderOrder,
  resolveUpstreamRenderLayers,
  splitEdgeWithNode,
  updateColorNode,
  wouldCreateCycle,
} from './nodeGraph';

const wasm = new URL('../../../../packages/artifact-core-web/generated/artifact_wasm_bg.wasm', import.meta.url);
const fixture = new URL('../../../../tests/fixtures/native-2d/branch-merge-mask-repeat.artifact.json', import.meta.url);
const utilitiesFixture = new URL('../../../../tests/fixtures/native-2d/graph-utilities.artifact.json', import.meta.url);
beforeAll(() => initSync({ module: readFileSync(wasm) }));
function open(document: CanvasDocument): WebSession {
  return new WebSession(
    JSON.stringify({
      artifactPackage: 'project',
      manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
      document,
    }),
  );
}
function read(): CanvasDocument {
  return JSON.parse(readFileSync(fixture, 'utf8'));
}
function readUtilities(): CanvasDocument {
  return JSON.parse(readFileSync(utilitiesFixture, 'utf8'));
}
function mutate(session: WebSession, action: SharedGraphAction) {
  const tx = beginTransaction(session, Number(session.revision()));
  expect(tx.ok).toBe(true);
  const result = updateTransaction(session, tx.transactionId!, [{ type: 'graph', action }]);
  expect(result.ok).toBe(true);
  expect(commitTransaction(session, tx.transactionId!).ok).toBe(true);
}

describe('shared graph and authoritative Web helpers', () => {
  it('agrees on explicit output dependencies, layer order and connected ports', () => {
    const document = read();
    const session = open(document);
    try {
      const plan = graphPlan(session);
      const outputPath = resolveOutputPath(document.graph!);
      expect(new Set(plan.dependencyNodeIds.concat('__export__'))).toEqual(outputPath.nodeIds);
      expect(new Set(plan.dependencyEdgeIds)).toEqual(outputPath.edgeIds);
      expect(plan.dependencyEdges).toEqual(document.graph!.edges.filter((edge) => outputPath.edgeIds.has(edge.id)));
      expect(plan.renderLayerIds).toEqual(
        resolveUpstreamRenderLayers('__export__', document.graph!, document.layers).map((layer) => layer.id),
      );
      expect(plan.editorLayerOrderIds).toEqual(
        resolveRenderOrder(document.graph!, document.layers).map((layer) => layer.id),
      );
      const ports = connectedPortIds(document.graph!);
      expect(new Set(plan.connectedPorts.sources)).toEqual(ports.sources);
      expect(new Set(plan.connectedPorts.targets)).toEqual(ports.targets);
      expect(plan.renderLayerIds).toEqual(['branch-ground', 'branch-art', 'branch-matte']); // independent expected output
      expect(plan.layoutPositions).toEqual(document.graph!.positions);
    } finally {
      session.free();
    }
  });

  it('replaces a target port and splits an edge exactly as Web helpers do', () => {
    const document = read();
    const session = open(document);
    try {
      const edge = {
        id: 'replacement',
        fromId: 'branch-ground',
        fromPort: 'out' as const,
        toId: 'branch-mask',
        toPort: 'mask' as const,
      };
      mutate(session, { kind: 'add_edge', edge });
      const expected = addGraphEdge(document.graph!, edge);
      expect(JSON.parse(session.export_json()).document.graph.edges).toEqual(expected.edges);
      expect(wouldCreateCycle(expected, 'branch-merge', 'branch-repeat')).toBe(true);
      // Splitting the ground -> merge edge through an existing transform node
      // would be valid only after that node is inserted; use a fixture utility.
      const node = { id: 'new-color', name: 'Color', contrast: 100, brightness: 100, saturation: 100, hue: 0 };
      mutate(session, { kind: 'add_node', collection: 'color', node, position: { x: 100, y: 100 } });
      mutate(session, {
        kind: 'split_edge',
        id: 'edge-branch-ground-branch-merge-a',
        node_id: 'new-color',
        input_port: 'in',
      });
      const webSplit = splitEdgeWithNode(expected, 'edge-branch-ground-branch-merge-a', 'new-color', 'in');
      expect(JSON.parse(session.export_json()).document.graph.edges).toEqual(webSplit.edges);
    } finally {
      session.free();
    }
  });

  it('matches a Web patch, reconnect, multi-delete and layer duplicate while retaining unknown metadata', () => {
    const document = readUtilities();
    const color = document.graph!.colorNodes![0];
    const session = open(document);
    try {
      mutate(session, { kind: 'patch_node', id: color.id, patch: { saturation: 140 } });
      const webPatched = updateColorNode(document.graph!, color.id, { saturation: 140 });
      expect(JSON.parse(session.export_json()).document.graph.colorNodes).toEqual(webPatched.colorNodes);
      const first = webPatched.edges[0];
      mutate(session, {
        kind: 'reconnect_edge',
        id: first.id,
        from_id: first.fromId,
        to_id: first.toId,
        to_port: first.toPort,
      });
      const webReconnected = addGraphEdge(removeGraphEdge(webPatched, first.id), first);
      expect(JSON.parse(session.export_json()).document.graph.edges).toEqual(webReconnected.edges);
      const duplicateId = 'parity-copy';
      const sourceId = document.layers[0].id;
      mutate(session, { kind: 'duplicate_nodes', copies: [{ id: sourceId, new_id: duplicateId }] });
      const webDuplicate = duplicateLayerInDocument(
        { ...document, graph: webReconnected },
        sourceId,
        () => duplicateId,
      );
      expect(JSON.parse(session.export_json()).document.layers).toEqual(webDuplicate.doc.layers);
      mutate(session, { kind: 'remove_nodes', ids: [duplicateId, color.id] });
      const webRemoved = deleteNodesFromDocument(webDuplicate.doc, [duplicateId, color.id]);
      expect(JSON.parse(session.export_json()).document.graph.edges).toEqual(webRemoved.graph?.edges);
      expect(JSON.parse(session.export_json()).document.layers).toEqual(webRemoved.layers);
    } finally {
      session.free();
    }
  });

  it('keeps areas organizational and exposes deterministic layout inputs for a disconnected branch', () => {
    const document = read();
    document.layers.push({ ...document.layers[0], id: 'orphan', name: 'Orphan' });
    document.graph!.positions.orphan = { x: 700, y: 800 };
    const session = open(document);
    try {
      const before = graphPlan(session);
      expect(before.disconnectedNodeIds).toEqual(['orphan']);
      expect(before.editorLayerOrderIds.at(-1)).toBe('orphan');
      const area = { id: 'parity-area', name: 'Area', color: '#ff705f', nodeIds: ['branch-repeat', 'branch-repeat'] };
      mutate(session, { kind: 'add_area', area });
      let web = addGraphArea(document.graph!, area);
      expect(JSON.parse(session.export_json()).document.graph.areas).toEqual(web.areas);
      mutate(session, { kind: 'assign_area', id: area.id, node_ids: ['branch-mask'] });
      web = assignNodesToGraphArea(web, area.id, ['branch-mask']);
      expect(JSON.parse(session.export_json()).document.graph.areas).toEqual(web.areas);
      expect(graphPlan(session).dependencyNodeIds).toEqual(before.dependencyNodeIds);
      expect(graphPlan(session).layoutNodeIds).toEqual(before.layoutNodeIds);
      expect(new Set(graphPlan(session, 'branch-repeat').downstreamNodeIds)).toEqual(
        collectDownstreamNodeIds('branch-repeat', web),
      );
    } finally {
      session.free();
    }
  });

  it('keeps stack mode separate and rejects cyclic, invalid and locked operations without a draft', () => {
    const document = read();
    const stack = open({ ...document, graph: undefined });
    try {
      expect(graphPlan(stack).mode).toBe('stack');
    } finally {
      stack.free();
    }
    document.layers[0].locked = true;
    const session = open(document);
    try {
      const before = session.export_json();
      const tx = beginTransaction(session, 0);
      expect(
        updateTransaction(session, tx.transactionId!, [
          { type: 'graph', action: { kind: 'remove_nodes', ids: ['branch-ground', 'branch-repeat'] } },
        ]).error?.code,
      ).toBe('LOCKED_LAYER');
      expect(
        updateTransaction(session, tx.transactionId!, [
          {
            type: 'graph',
            action: {
              kind: 'add_edge',
              edge: { id: 'cycle', fromId: 'branch-merge', fromPort: 'out', toId: 'branch-repeat', toPort: 'in' },
            },
          },
        ]).error?.code,
      ).toBe('INVALID_VALUE');
      expect(
        updateTransaction(session, tx.transactionId!, [
          { type: 'graph', action: { kind: 'patch_node', id: 'branch-mask', patch: { mode: 'impossible' } } },
        ]).error?.code,
      ).toBe('INVALID_VALUE');
      expect(session.export_json()).toBe(before);
      expect(graphPlan(session).renderLayerIds).toEqual(['branch-ground', 'branch-art', 'branch-matte']);
    } finally {
      session.free();
    }
  });
});
