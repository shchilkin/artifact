import { describe, expect, it } from 'vitest';
import { GRAPH_REACH_FIXTURES, renderedNodeIds } from '../test-fixtures/render/graphReachFixtures';
import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../types/config';
import {
  makeFillLayer,
  makeGraphColorNode,
  makeGraphEnvironmentNode,
  makeGraphMaskNode,
  makeGraphMaterialNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeGraphScene3DNode,
  makeGraphShaderNode,
  makeGraphTransformNode,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import { buildGraphLayerTree, flattenGraphLayerTree, type GraphLayerTree, type GraphTreeRow } from './graphLayerTree';
import { EXPORT_NODE_ID, inferLinearGraph } from './nodeGraph';
import { collectGraphRenderReach } from './renderer';

let edgeCounter = 0;
function edge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  edgeCounter += 1;
  return { id: `e-${edgeCounter}`, fromId, fromPort: 'out', toId, toPort };
}

function fill(id: string, color = '#3366aa'): Layer {
  return makeFillLayer({ id, name: id, color, opacity: 100, blendMode: 'normal' });
}

function text(id: string): Layer {
  return makeTextLayer({ id, name: id, content: 'A' });
}

function graphOf(partial: Partial<CanvasGraph>): CanvasGraph {
  return { edges: [], positions: {}, mergeNodes: [], colorNodes: [], ...partial };
}

function documentOf(layers: Layer[], graph: CanvasGraph): CanvasDocument {
  return {
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers,
    graph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function allNodeIds(doc: CanvasDocument): Set<string> {
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
 * Oracle: the nodes the real renderer touches when it renders Output, from the shared renderer-backed
 * fixture helpers. `readOnly` lists nodes the renderer reads without rendering (Scene 3D models, material
 * settings), which each fixture states by hand so the oracle stays independent of the tree.
 */
async function rendererReach(doc: CanvasDocument, readOnly: string[] = []): Promise<Set<string>> {
  const existing = allNodeIds(doc);
  const rendered = await renderedNodeIds(doc, doc.graph ?? inferLinearGraph(doc.layers));
  return new Set([...rendered, ...readOnly].filter((id) => existing.has(id)));
}

function fullEntries(rows: GraphTreeRow[]) {
  return flattenGraphLayerTree(rows).filter((row) => !row.reference);
}

function idsOf(rows: GraphTreeRow[]) {
  return fullEntries(rows).map((row) => row.nodeId);
}

function expectTreeMatchesRenderer(doc: CanvasDocument, tree: GraphLayerTree, reached: Set<string>) {
  const outputIds = idsOf(tree.output);
  const detachedIds = tree.notInOutput.flatMap((stack) => idsOf(stack));
  const allIds = [...outputIds, ...detachedIds];

  expect(new Set(outputIds)).toEqual(reached);
  expect(tree.reachedNodeIds).toEqual(reached);
  expect(new Set(detachedIds)).toEqual(new Set([...allNodeIds(doc)].filter((id) => !reached.has(id))));
  // Every node has exactly one full entry.
  expect(allIds.length).toBe(new Set(allIds).size);
}

function summarize(rows: GraphTreeRow[]): unknown[] {
  return rows.map((row) =>
    row.reference
      ? `↪ ${row.nodeId}`
      : row.groups.length === 0
        ? row.nodeId
        : { [row.nodeId]: Object.fromEntries(row.groups.map((group) => [group.label, summarize(group.rows)])) },
  );
}

describe('buildGraphLayerTree on the shared reach fixtures', () => {
  for (const fixture of GRAPH_REACH_FIXTURES) {
    it(`lists exactly the nodes the renderer reaches: ${fixture.name}`, async () => {
      const doc = documentOf(fixture.layers, fixture.graph);
      const tree = buildGraphLayerTree(doc);
      const reached = await rendererReach(doc, fixture.readOnly);

      expectTreeMatchesRenderer(doc, tree, reached);
      // The tree and Layers row status read the same reachability.
      const existing = allNodeIds(doc);
      expect(tree.reachedNodeIds).toEqual(
        new Set([...collectGraphRenderReach(doc, fixture.graph)].filter((id) => existing.has(id))),
      );
    });
  }
});

describe('buildGraphLayerTree', () => {
  it('lists a linear stack top-first', async () => {
    const layers = [fill('bottom'), fill('middle', '#aa3366'), text('top')];
    const doc = documentOf(layers, inferLinearGraph(layers));
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual(['top', 'middle', 'bottom']);
    expect(tree.notInOutput).toEqual([]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('shows a merge as a folder of its b stack, with a continuing the parent stack below it', async () => {
    const layers = [fill('base'), text('title')];
    const graph = graphOf({
      mergeNodes: [makeGraphMergeNode({ id: 'merge', blendMode: 'screen', opacity: 70 })],
      colorNodes: [makeGraphColorNode({ id: 'grade' })],
      edges: [
        edge('base', 'merge', 'a'),
        edge('title', 'grade', 'in'),
        edge('grade', 'merge', 'b'),
        edge('merge', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([{ merge: { Group: ['grade', 'title'] } }, 'base']);
    expect(tree.output[0]).toMatchObject({ kind: 'merge', name: 'Merge' });
    expect(tree.output[0].groups[0]).toMatchObject({ kind: 'group', port: 'b', key: 'merge:group' });
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('nests a mask source as a clip under the mask row', async () => {
    const layers = [fill('source'), text('matte')];
    const graph = graphOf({
      maskNodes: [makeGraphMaskNode({ id: 'mask' })],
      edges: [edge('source', 'mask', 'in'), edge('matte', 'mask', 'mask'), edge('mask', EXPORT_NODE_ID, 'in')],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([{ mask: { Mask: ['matte'] } }, 'source']);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('continues a repeat through bg and nests the item as the pattern source', async () => {
    const layers = [fill('backdrop'), text('item')];
    const graph = graphOf({
      repeatNodes: [makeGraphRepeatNode({ id: 'repeat' })],
      edges: [edge('item', 'repeat', 'in'), edge('backdrop', 'repeat', 'bg'), edge('repeat', EXPORT_NODE_ID, 'in')],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([{ repeat: { 'Pattern source': ['item'] } }, 'backdrop']);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('nests Scene 3D model, material, and environment stacks as inputs', async () => {
    const primitive = makeSourceLayer('primitive', { id: 'sphere', name: 'sphere', primitiveShape: 'sphere' });
    const layers = [fill('backdrop'), fill('sky', '#88aaff'), fill('rough', '#777777'), primitive];
    const graph = graphOf({
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
      materialNodes: [makeGraphMaterialNode({ id: 'chrome' })],
      environmentNodes: [makeGraphEnvironmentNode({ id: 'env' })],
      edges: [
        edge('backdrop', 'scene', 'bg'),
        edge('sphere', 'scene', 'model'),
        edge('chrome', 'scene', 'material'),
        edge('rough', 'chrome', 'roughness'),
        edge('sky', 'env', 'in'),
        edge('env', 'scene', 'env'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([
      {
        scene: {
          Model: ['sphere'],
          Material: [{ chrome: { Roughness: ['rough'] } }],
          Environment: ['env', 'sky'],
        },
      },
      'backdrop',
    ]);
    expect(tree.output[0].groups.map((group) => group.kind)).toEqual(['input', 'input', 'input']);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc, ['sphere', 'chrome']));
  });

  it('places a shared node once at its first depth-first reach and references it elsewhere', async () => {
    const layers = [fill('shared'), text('title')];
    const graph = graphOf({
      mergeNodes: [makeGraphMergeNode({ id: 'merge' })],
      transformNodes: [makeGraphTransformNode({ id: 'move' })],
      edges: [
        edge('shared', 'move', 'in'),
        edge('move', 'merge', 'a'),
        edge('shared', 'merge', 'b'),
        edge('merge', 'title', 'bg'),
        edge('title', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    // The primary stack is walked before the merge's b stack, so `shared` lives under `move`.
    expect(summarize(tree.output)).toEqual(['title', { merge: { Group: ['↪ shared'] } }, 'move', 'shared']);
    const reference = flattenGraphLayerTree(tree.output).find((row) => row.reference)!;
    expect(reference).toMatchObject({ nodeId: 'shared', groups: [] });
    expect(reference.key).not.toBe('shared');
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('lists unreachable nodes, ignored inputs, and losing duplicate inputs under Not in output', async () => {
    const layers = [fill('base'), fill('loser', '#ff0000'), fill('ignored', '#00ff00'), text('orphan'), fill('lonely')];
    const graph = graphOf({
      colorNodes: [makeGraphColorNode({ id: 'orphan-grade' })],
      shaderNodes: [makeGraphShaderNode({ id: 'gradient', role: 'fill' })],
      mergeNodes: [makeGraphMergeNode({ id: 'merge' })],
      edges: [
        edge('base', 'merge', 'a'),
        edge('gradient', 'merge', 'b'),
        // The renderer takes the first edge on a port; the second one is ignored.
        edge('loser', 'merge', 'a'),
        // A fill-role shader ignores its backdrop.
        edge('ignored', 'gradient', 'bg'),
        edge('orphan', 'orphan-grade', 'in'),
        edge('merge', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([{ merge: { Group: ['gradient'] } }, 'base']);
    expect(tree.notInOutput.map(summarize)).toEqual([['lonely'], ['ignored'], ['loser'], ['orphan-grade', 'orphan']]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('puts every node under Not in output when Output has no input', async () => {
    const layers = [fill('bottom'), text('top')];
    const graph = graphOf({ edges: [edge('bottom', 'top', 'bg')] });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(tree.output).toEqual([]);
    expect(tree.notInOutput.map(summarize)).toEqual([['top', 'bottom']]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('continues an effect-role shader through bg', async () => {
    const layers = [fill('backdrop')];
    const graph = graphOf({
      shaderNodes: [makeGraphShaderNode({ id: 'wash', role: 'effect' })],
      edges: [edge('backdrop', 'wash', 'bg'), edge('wash', EXPORT_NODE_ID, 'in')],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual(['wash', 'backdrop']);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('nests a primitive layer material and its texture maps as inputs', async () => {
    const primitive = makeSourceLayer('primitive', { id: 'ball', name: 'ball', primitiveShape: 'sphere' });
    const layers = [fill('backdrop'), fill('rough', '#777777'), primitive];
    const graph = graphOf({
      materialNodes: [makeGraphMaterialNode({ id: 'chrome' })],
      edges: [
        edge('backdrop', 'ball', 'bg'),
        edge('chrome', 'ball', 'material'),
        edge('rough', 'chrome', 'roughness'),
        edge('ball', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([
      { ball: { Material: [{ chrome: { Roughness: ['rough'] } }] } },
      'backdrop',
    ]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc, ['chrome']));
  });

  it('continues a standalone material through albedo and leaves its other maps out', async () => {
    const layers = [fill('base'), fill('rough', '#777777')];
    const graph = graphOf({
      materialNodes: [makeGraphMaterialNode({ id: 'chrome' })],
      edges: [
        edge('base', 'chrome', 'albedo'),
        edge('rough', 'chrome', 'roughness'),
        edge('chrome', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual(['chrome', 'base']);
    expect(tree.notInOutput.map(summarize)).toEqual([['rough']]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('reads an environment node without a source but does not render it', async () => {
    const layers = [fill('backdrop')];
    const graph = graphOf({
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
      environmentNodes: [makeGraphEnvironmentNode({ id: 'env' })],
      edges: [edge('backdrop', 'scene', 'bg'), edge('env', 'scene', 'env'), edge('scene', EXPORT_NODE_ID, 'in')],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([{ scene: { Environment: ['env'] } }, 'backdrop']);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc, ['env']));
  });

  it('renders a shader on a material port as the material', async () => {
    const layers = [fill('backdrop'), fill('ignored-backdrop', '#00ff00')];
    const graph = graphOf({
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
      shaderNodes: [makeGraphShaderNode({ id: 'gradient', role: 'fill' })],
      edges: [
        edge('backdrop', 'scene', 'bg'),
        edge('gradient', 'scene', 'material'),
        edge('ignored-backdrop', 'gradient', 'bg'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual([{ scene: { Material: ['gradient'] } }, 'backdrop']);
    expect(tree.notInOutput.map(summarize)).toEqual([['ignored-backdrop']]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('leaves a node that is not a 3D source on a model port out of the output', async () => {
    const layers = [fill('backdrop'), fill('not-a-model', '#ff0000')];
    const graph = graphOf({
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
      edges: [
        edge('backdrop', 'scene', 'bg'),
        edge('not-a-model', 'scene', 'model'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    expect(summarize(tree.output)).toEqual(['scene', 'backdrop']);
    expect(tree.notInOutput.map(summarize)).toEqual([['not-a-model']]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('leaves a node that is not a material on a material port out, but keeps the texture maps it carries', async () => {
    const layers = [fill('backdrop'), fill('graded', '#ff0000'), fill('rough', '#777777')];
    const graph = graphOf({
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene', transparent: true })],
      colorNodes: [makeGraphColorNode({ id: 'grade' })],
      edges: [
        edge('backdrop', 'scene', 'bg'),
        edge('grade', 'scene', 'material'),
        edge('graded', 'grade', 'in'),
        edge('rough', 'grade', 'roughness'),
        edge('scene', EXPORT_NODE_ID, 'in'),
      ],
    });
    const doc = documentOf(layers, graph);
    const tree = buildGraphLayerTree(doc);

    // The renderer neither renders nor reads `grade`, but still renders what feeds its texture ports.
    expect(summarize(tree.output)).toEqual([{ scene: { Roughness: ['rough'] } }, 'backdrop']);
    expect(tree.notInOutput.map(summarize)).toEqual([['grade', 'graded']]);
    expectTreeMatchesRenderer(doc, tree, await rendererReach(doc));
  });

  it('tolerates cycles and edges from deleted nodes', () => {
    const layers = [fill('a'), fill('b'), fill('c'), fill('d'), fill('e')];
    const graph = graphOf({
      edges: [
        edge('a', EXPORT_NODE_ID, 'in'),
        edge('b', 'a', 'bg'),
        edge('a', 'b', 'bg'),
        edge('c', 'd', 'bg'),
        edge('d', 'c', 'bg'),
        edge('deleted-node', 'e', 'bg'),
      ],
    });
    const tree = buildGraphLayerTree(documentOf(layers, graph));

    expect(summarize(tree.output)).toEqual(['a', 'b', '↪ a']);
    expect(tree.notInOutput.map(summarize)).toEqual([['e'], ['d', 'c', '↪ d']]);
  });

  it('builds the linear stack when a document has no graph', () => {
    const doc: CanvasDocument = { ...documentOf([fill('bottom'), text('top')], graphOf({})), graph: undefined };
    expect(summarize(buildGraphLayerTree(doc).output)).toEqual(['top', 'bottom']);
  });
});
