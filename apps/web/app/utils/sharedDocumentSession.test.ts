import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync } from '../../../../packages/artifact-core-web/generated/artifact_wasm';
import type { CanvasDocument } from '../types/config';
import { addLayerToDocument, bootstrapDocumentGraph, updateLayerInDocument } from './documentCommands';
import { createBlankDocument } from './documentPersistence';
import { documentCommands, SharedDocumentSession } from './sharedDocumentSession';

const wasm = new URL('../../../../packages/artifact-core-web/generated/artifact_wasm_bg.wasm', import.meta.url);
const graphFixture = new URL(
  '../../../../tests/fixtures/native-2d/branch-merge-mask-repeat.artifact.json',
  import.meta.url,
);
const fontFixture = new URL('../../../../tests/fixtures/native-2d/text-font.artifact.json', import.meta.url);

beforeAll(() => initSync({ module: readFileSync(wasm) }));

const text = {
  id: 'web-title',
  kind: 'text' as const,
  name: 'Title',
  visible: true,
  locked: false,
  content: 'First',
  font: 'MONO' as const,
  size: 64,
  color: '#ffffff',
  opacity: 100,
  blendMode: 'normal',
  x: 0.5,
  y: 0.5,
  rotation: 0,
  align: 'center' as const,
  scaleX: 1,
  scaleY: 1,
};

describe('main Web shared document session', () => {
  it('keeps a single real WASM undo timeline across structure, shared and Web-only properties', async () => {
    const initial = createBlankDocument();
    const owner = await SharedDocumentSession.open(initial);
    try {
      const added = addLayerToDocument(initial, text);
      expect(owner.apply(added, 'snapshot')).toBe(added);
      const edited = updateLayerInDocument(added, text.id, { content: 'Second', blendMode: 'multiply' });
      expect(documentCommands(added, edited)).toEqual(
        expect.arrayContaining([
          { type: 'patch_layer', id: text.id, patch: { content: 'Second' } },
          {
            type: 'bridge',
            capability: 'web:layer-property',
            target: { scope: 'layer_field', id: text.id, field: 'blendMode' },
            value: 'multiply',
          },
        ]),
      );
      expect(owner.apply(edited, 'snapshot')).toBe(edited);
      expect(owner.canUndo).toBe(true);
      expect(owner.undo()?.layers[0]).toMatchObject({ content: 'First', blendMode: 'normal' });
      expect(owner.undo()?.layers).toHaveLength(0);
      expect(owner.redo()?.layers).toHaveLength(1);
      expect(owner.redo()?.layers[0]).toMatchObject({ content: 'Second', blendMode: 'multiply' });
    } finally {
      owner.dispose();
    }
  });

  it('coalesces debounce ticks into one transaction and preserves unchanged layer references', async () => {
    const initial = addLayerToDocument(createBlankDocument(), text);
    const owner = await SharedDocumentSession.open(initial);
    try {
      const first = updateLayerInDocument(initial, text.id, { x: 0.6 });
      const second = updateLayerInDocument(first, text.id, { x: 0.7 });
      expect(owner.apply(first, 'debounce')).toBe(first);
      expect(owner.apply(second, 'debounce')).toBe(second);
      owner.flush();
      expect(owner.undo()?.layers[0].x).toBe(0.5);
      expect(owner.redo()?.layers[0].x).toBe(0.7);
    } finally {
      owner.dispose();
    }
  });

  it('bridges out-of-scope shader/3D graph values into the same WASM history', async () => {
    const initial = JSON.parse(readFileSync(graphFixture, 'utf8')) as CanvasDocument;
    const graph = initial.graph!;
    const owner = await SharedDocumentSession.open(initial);
    try {
      const next = {
        ...initial,
        graph: { ...graph, shaderNodes: [{ id: 'shader-web', name: 'Shader', shaderKind: 'meshGradient' }] },
      } as CanvasDocument;
      const commands = documentCommands(initial, next);
      expect(commands).toContainEqual(
        expect.objectContaining({ type: 'bridge_structure', capability: 'web:structure' }),
      );
      expect(owner.apply(next, 'snapshot')).toBe(next);
      expect(owner.undo()?.graph?.shaderNodes).toEqual(graph.shaderNodes);
      expect(owner.redo()?.graph?.shaderNodes).toEqual(next.graph?.shaderNodes);
    } finally {
      owner.dispose();
    }
  });

  it('bridges Web-only shader edges and positions without losing undo or redo', async () => {
    const fixture = JSON.parse(readFileSync(graphFixture, 'utf8')) as CanvasDocument;
    const initial = {
      ...fixture,
      graph: {
        ...fixture.graph!,
        shaderNodes: [{ id: 'shader-web', name: 'Shader', shaderKind: 'meshGradient' }],
        positions: { ...fixture.graph!.positions, 'shader-web': { x: 700, y: 160 } },
      },
    } as CanvasDocument;
    const edge = { id: 'edge-web-shader', fromId: 'branch-ground', fromPort: 'out', toId: 'shader-web', toPort: 'in' };
    const connected = { ...initial, graph: { ...initial.graph!, edges: [...initial.graph!.edges, edge] } };
    const moved = {
      ...connected,
      graph: { ...connected.graph, positions: { ...connected.graph.positions, 'shader-web': { x: 800, y: 180 } } },
    };
    const disconnected = { ...moved, graph: { ...moved.graph, edges: initial.graph!.edges } };
    const bridge = { type: 'bridge', capability: 'web:graph', target: { scope: 'graph' } };
    expect(documentCommands(initial, connected)).toContainEqual(expect.objectContaining(bridge));
    expect(documentCommands(connected, moved)).toContainEqual(expect.objectContaining(bridge));
    expect(documentCommands(moved, disconnected)).toContainEqual(expect.objectContaining(bridge));
    const owner = await SharedDocumentSession.open(initial);
    try {
      owner.apply(connected, 'snapshot');
      owner.apply(moved, 'snapshot');
      owner.apply(disconnected, 'snapshot');
      expect(owner.undo()?.graph?.edges).toContainEqual(edge);
      expect(owner.undo()?.graph?.positions['shader-web']).toEqual({ x: 700, y: 160 });
      expect(owner.undo()?.graph?.edges).toEqual(initial.graph!.edges);
      expect(owner.redo()?.graph?.edges).toContainEqual(edge);
      expect(owner.redo()?.graph?.positions['shader-web']).toEqual({ x: 800, y: 180 });
      expect(owner.redo()?.graph?.edges).toEqual(initial.graph!.edges);
    } finally {
      owner.dispose();
    }
  });

  it('routes a supported graph node insertion through the shared graph action', async () => {
    const initial = JSON.parse(readFileSync(graphFixture, 'utf8')) as CanvasDocument;
    const graph = initial.graph!;
    const node = { id: 'web-color-new', name: 'Color', contrast: 100, brightness: 100, saturation: 100, hue: 0 };
    const position = { x: 640, y: 80 };
    const next = {
      ...initial,
      graph: {
        ...graph,
        colorNodes: [...(graph.colorNodes ?? []), node],
        positions: { ...graph.positions, [node.id]: position },
      },
    } as CanvasDocument;
    expect(documentCommands(initial, next)).toEqual([
      { type: 'graph', action: { kind: 'add_node', collection: 'color', node, position } },
    ]);
    const owner = await SharedDocumentSession.open(initial);
    try {
      expect(owner.apply(next, 'snapshot')).toBe(next);
      expect(owner.undo()?.graph?.colorNodes).toEqual(graph.colorNodes);
    } finally {
      owner.dispose();
    }
  });

  it('bridges an area addition with retained-area edits as one undoable graph change', async () => {
    const initial = JSON.parse(readFileSync(graphFixture, 'utf8')) as CanvasDocument;
    const oldAreas = initial.graph!.areas!;
    const next = {
      ...initial,
      graph: {
        ...initial.graph!,
        areas: [
          { ...oldAreas[0], name: 'Renamed composite' },
          { id: 'new-web-area', name: 'Ground', nodeIds: ['branch-ground'], color: '#abcdef' },
        ],
      },
    } as CanvasDocument;
    expect(documentCommands(initial, next)).toContainEqual(
      expect.objectContaining({ type: 'bridge', capability: 'web:graph' }),
    );
    const owner = await SharedDocumentSession.open(initial);
    try {
      expect(owner.apply(next, 'snapshot')).toBe(next);
      expect(owner.undo()?.graph?.areas).toEqual(oldAreas);
      expect(owner.redo()?.graph?.areas).toEqual(next.graph?.areas);
    } finally {
      owner.dispose();
    }
  });

  it('keeps Layer edits and first Nodes bootstrap in one ordered undo/redo timeline', async () => {
    const initial = addLayerToDocument(createBlankDocument(), text);
    const owner = await SharedDocumentSession.open(initial);
    try {
      const edited = updateLayerInDocument(initial, text.id, { content: 'After layers edit' });
      owner.apply(edited, 'snapshot');
      const nodes = bootstrapDocumentGraph(edited);
      owner.apply(nodes, 'snapshot');
      expect(owner.document.graph).toBeDefined();
      expect(owner.undo()?.graph).toBeUndefined();
      expect(owner.undo()?.layers[0]).toMatchObject({ content: 'First' });
      expect(owner.redo()?.layers[0]).toMatchObject({ content: 'After layers edit' });
      expect(owner.redo()?.graph).toEqual(nodes.graph);
    } finally {
      owner.dispose();
    }
  });

  it('replaces an imported document with embedded font metadata as one real WASM undo step', async () => {
    const initial = createBlankDocument();
    const imported = JSON.parse(readFileSync(fontFixture, 'utf8')) as CanvasDocument;
    const owner = await SharedDocumentSession.open(initial);
    try {
      expect(imported.fontAssets?.length).toBeGreaterThan(0);
      expect(owner.replace(imported)).toBe(imported);
      expect(owner.document.fontAssets).toEqual(imported.fontAssets);
      expect(owner.undo()?.layers).toEqual(initial.layers);
      expect(owner.redo()?.fontAssets).toEqual(imported.fontAssets);
    } finally {
      owner.dispose();
    }
  });

  it('keeps root asset collection edits in the same history', async () => {
    const initial = createBlankDocument();
    const owner = await SharedDocumentSession.open(initial);
    const asset = { id: 'font-local', label: 'Local font', dataUrl: 'data:font/woff2;base64,AA==', mime: 'font/woff2' };
    const next = { ...initial, fontAssets: [asset] };
    try {
      expect(documentCommands(initial, next)).toEqual([
        { type: 'edit_assets', collection: 'fontAssets', replace: [asset] },
      ]);
      expect(owner.apply(next, 'snapshot')).toBe(next);
      expect(owner.undo()?.fontAssets).toBeUndefined();
      expect(owner.redo()?.fontAssets).toEqual([asset]);
    } finally {
      owner.dispose();
    }
  });
});
