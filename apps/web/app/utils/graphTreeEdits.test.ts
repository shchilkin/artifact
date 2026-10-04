import { describe, expect, it } from 'vitest';
import { allPixels, pixelsEqual } from '../test-fixtures/render/fixtures';
import { expectDocumentTreeMatchesRenderer } from '../test-fixtures/render/graphTreeOracle';
import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../types/config';
import {
  makeEffectPresetLayer,
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
import { isLayerStackGraph } from './documentCommands';
import {
  importArtifactProjectPackage,
  parseArtifactProjectPackage,
  prepareArtifactProjectPackage,
  serializeArtifactProjectPackage,
} from './documentPackage';
import { buildGraphLayerTree, type GraphTreeRow } from './graphLayerTree';
import {
  addLayerAboveTreeRow,
  buildGraphTreeEditIndex,
  checkTreeDrop,
  checkTreeInsertAbove,
  checkTreeMove,
  checkTreeRowMovable,
  deleteTreeNode,
  deleteTreeNodes,
  graphNodeConsumerCount,
  moveTreeRow,
  stepTreeRow,
  type TreeEditResult,
} from './graphTreeEdits';
import { EXPORT_NODE_ID } from './nodeGraph';
import { renderDocument } from './renderer';

function edge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return { id: `${fromId}->${toId}:${toPort}`, fromId, fromPort: 'out', toId, toPort };
}

function fill(id: string, color = '#3366aa', opacity = 100): Layer {
  return makeFillLayer({ id, name: id, color, opacity, blendMode: 'normal' });
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

function summarize(rows: GraphTreeRow[]): unknown[] {
  return rows.map((row) =>
    row.reference
      ? `↪ ${row.nodeId}`
      : row.groups.length === 0
        ? row.nodeId
        : { [row.nodeId]: Object.fromEntries(row.groups.map((group) => [group.label, summarize(group.rows)])) },
  );
}

function outline(doc: CanvasDocument) {
  const tree = buildGraphLayerTree(doc);
  return { output: summarize(tree.output), notInOutput: tree.notInOutput.map(summarize) };
}

const edgeKey = (item: GraphEdge) => `${item.fromId}>${item.toId}.${item.toPort}`;

/** The edges an edit removed and added, by endpoints. Every other edge is preserved. */
function edgeDiff(before: CanvasDocument, after: CanvasDocument) {
  const was = new Set(before.graph!.edges.map(edgeKey));
  const now = new Set(after.graph!.edges.map(edgeKey));
  return {
    removed: [...was].filter((key) => !now.has(key)).sort(),
    added: [...now].filter((key) => !was.has(key)).sort(),
  };
}

function edited(result: TreeEditResult): CanvasDocument {
  if (!result.ok) throw new Error(`Edit was blocked: ${result.reason}`);
  return result.doc;
}

function blockedReason(result: TreeEditResult) {
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.reason;
}

function layerOrder(doc: CanvasDocument) {
  return doc.layers.map((layer) => layer.id);
}

/** Output ← top(bg) ← grade(in) ← mid(bg) ← base, plus a loose `spare` layer. */
function linearDoc() {
  const layers = [fill('base'), fill('mid', '#aa3366'), text('top'), fill('spare', '#22aa66')];
  return documentOf(
    layers,
    graphOf({
      colorNodes: [makeGraphColorNode({ id: 'grade' })],
      edges: [
        edge('base', 'mid', 'bg'),
        edge('mid', 'grade', 'in'),
        edge('grade', 'top', 'bg'),
        edge('top', EXPORT_NODE_ID, 'in'),
      ],
    }),
  );
}

/** Output ← merge(a: paper ← base, b: grade ← title). */
function mergeDoc() {
  const layers = [fill('base'), fill('paper', '#ddccaa', 60), text('title')];
  return documentOf(
    layers,
    graphOf({
      mergeNodes: [makeGraphMergeNode({ id: 'merge', blendMode: 'screen', opacity: 70 })],
      colorNodes: [makeGraphColorNode({ id: 'grade' })],
      edges: [
        edge('base', 'paper', 'bg'),
        edge('paper', 'merge', 'a'),
        edge('title', 'grade', 'in'),
        edge('grade', 'merge', 'b'),
        edge('merge', EXPORT_NODE_ID, 'in'),
      ],
    }),
  );
}

/** Output ← mask(in: source, mask: soften ← matte). */
function maskDoc() {
  const layers = [fill('source'), text('matte')];
  return documentOf(
    layers,
    graphOf({
      maskNodes: [makeGraphMaskNode({ id: 'mask' })],
      colorNodes: [makeGraphColorNode({ id: 'soften' })],
      edges: [
        edge('source', 'mask', 'in'),
        edge('matte', 'soften', 'in'),
        edge('soften', 'mask', 'mask'),
        edge('mask', EXPORT_NODE_ID, 'in'),
      ],
    }),
  );
}

/** Output ← repeat(bg: backdrop, in: item). */
function repeatDoc() {
  const layers = [fill('backdrop'), text('item')];
  return documentOf(
    layers,
    graphOf({
      repeatNodes: [makeGraphRepeatNode({ id: 'repeat' })],
      edges: [edge('item', 'repeat', 'in'), edge('backdrop', 'repeat', 'bg'), edge('repeat', EXPORT_NODE_ID, 'in')],
    }),
  );
}

/** Output ← scene(bg: backdrop, model: sphere, material: chrome(roughness: rough), env: env ← sky). */
function sceneDoc() {
  const sphere = makeSourceLayer('primitive', { id: 'sphere', name: 'sphere', primitiveShape: 'sphere' });
  const layers = [fill('backdrop'), fill('sky', '#88aaff'), fill('rough', '#777777'), sphere];
  return documentOf(
    layers,
    graphOf({
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
    }),
  );
}

/** Output ← title(bg) ← merge(a: move ← shared, b: shared): `shared` feeds two inputs. */
function fanOutDoc() {
  const layers = [fill('shared'), text('title')];
  return documentOf(
    layers,
    graphOf({
      mergeNodes: [makeGraphMergeNode({ id: 'merge' })],
      transformNodes: [makeGraphTransformNode({ id: 'move' })],
      edges: [
        edge('shared', 'move', 'in'),
        edge('move', 'merge', 'a'),
        edge('shared', 'merge', 'b'),
        edge('merge', 'title', 'bg'),
        edge('title', EXPORT_NODE_ID, 'in'),
      ],
    }),
  );
}

describe('reorder within a run', () => {
  it('rewires a linear run and keeps its outer ends attached', async () => {
    const doc = linearDoc();
    const next = edited(moveTreeRow(doc, 'base', 'top', 'above'));

    expect(outline(next).output).toEqual(['base', 'top', 'grade', 'mid']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['base>mid.bg', `top>${EXPORT_NODE_ID}.in`],
      added: [`base>${EXPORT_NODE_ID}.in`, 'top>base.bg'],
    });
    expect(layerOrder(next)).toEqual(['mid', 'top', 'base', 'spare']);
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('wires an effect or single-input utility through in and a layer through bg', async () => {
    const effect = makeEffectPresetLayer('grain', { id: 'grain', name: 'grain' });
    const doc = linearDoc();
    const withEffect: CanvasDocument = {
      ...doc,
      layers: [...doc.layers, effect],
      graph: {
        ...doc.graph!,
        edges: [...doc.graph!.edges.filter((item) => item.toId !== EXPORT_NODE_ID), edge('top', 'grain', 'in')],
      },
    };
    withEffect.graph!.edges.push(edge('grain', EXPORT_NODE_ID, 'in'));

    const next = edited(moveTreeRow(withEffect, 'grade', 'grain', 'above'));
    expect(outline(next).output).toEqual(['grade', 'grain', 'top', 'mid', 'base']);
    expect(edgeDiff(withEffect, next)).toEqual({
      removed: ['grade>top.bg', `grain>${EXPORT_NODE_ID}.in`, 'mid>grade.in'],
      added: [`grade>${EXPORT_NODE_ID}.in`, 'grain>grade.in', 'mid>top.bg'],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('steps a row up and down its stack', async () => {
    const doc = linearDoc();
    const up = edited(stepTreeRow(doc, 'grade', 'up'));
    expect(outline(up).output).toEqual(['grade', 'top', 'mid', 'base']);
    const down = edited(stepTreeRow(up, 'grade', 'down'));
    expect(outline(down).output).toEqual(['top', 'grade', 'mid', 'base']);
    expect(blockedReason(stepTreeRow(doc, 'top', 'up'))).toBe('top is already at the top of its stack.');
    expect(blockedReason(stepTreeRow(doc, 'base', 'down'))).toBe('base is already at the bottom of its stack.');
    await expectDocumentTreeMatchesRenderer(down);
  });

  it('moves a merge folder within its run with its group attached', async () => {
    const doc = mergeDoc();
    const next = edited(moveTreeRow(doc, 'merge', 'paper', 'below'));

    expect(outline(next).output).toEqual(['paper', { merge: { Group: ['grade', 'title'] } }, 'base']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['base>paper.bg', `merge>${EXPORT_NODE_ID}.in`, 'paper>merge.a'],
      added: ['base>merge.a', 'merge>paper.bg', `paper>${EXPORT_NODE_ID}.in`],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('reorders a run that ends at a shared node, which stays attached below it', async () => {
    const doc = fanOutDoc();
    const next = edited(moveTreeRow(doc, 'title', 'move', 'below'));

    expect(outline(next).output).toEqual([{ merge: { Group: ['↪ shared'] } }, 'move', 'title', 'shared']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['merge>title.bg', 'shared>move.in', `title>${EXPORT_NODE_ID}.in`],
      added: [`merge>${EXPORT_NODE_ID}.in`, 'shared>title.bg', 'title>move.in'],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('reorders the backdrop run of a Scene 3D node and leaves its inputs alone', async () => {
    const doc = sceneDoc();
    const next = edited(moveTreeRow(doc, 'backdrop', 'scene', 'above'));

    expect(outline(next).output[0]).toBe('backdrop');
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['backdrop>scene.bg', `scene>${EXPORT_NODE_ID}.in`],
      added: [`backdrop>${EXPORT_NODE_ID}.in`, 'scene>backdrop.bg'],
    });
    await expectDocumentTreeMatchesRenderer(next, ['sphere', 'chrome']);
  });

  it('keeps a moved edge first on its port so the renderer still reads it', async () => {
    const doc = linearDoc();
    // `spare` also points at mid.bg, after the winning edge: the renderer ignores it.
    doc.graph!.edges.push(edge('spare', 'top', 'bg'));
    const next = edited(moveTreeRow(doc, 'grade', 'mid', 'below'));

    expect(outline(next).output).toEqual(['top', 'mid', 'grade', 'base']);
    const topInputs = next.graph!.edges.filter((item) => item.toId === 'top' && item.toPort === 'bg');
    expect(topInputs.map((item) => item.fromId)).toEqual(['mid', 'spare']);
    await expectDocumentTreeMatchesRenderer(next);
  });
});

describe('move a row between runs', () => {
  it('moves a row out of a merge b stack into the parent stack', async () => {
    const doc = mergeDoc();
    const next = edited(moveTreeRow(doc, 'title', 'merge', 'above'));

    expect(outline(next).output).toEqual(['title', { merge: { Group: ['grade'] } }, 'paper', 'base']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: [`merge>${EXPORT_NODE_ID}.in`, 'title>grade.in'],
      added: ['merge>title.bg', `title>${EXPORT_NODE_ID}.in`],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('moves a row into a merge b stack', async () => {
    const doc = mergeDoc();
    const next = edited(moveTreeRow(doc, 'paper', 'grade', 'below'));

    expect(outline(next).output).toEqual([{ merge: { Group: ['grade', 'paper', 'title'] } }, 'base']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['base>paper.bg', 'paper>merge.a', 'title>grade.in'],
      added: ['base>merge.a', 'paper>grade.in', 'title>paper.bg'],
    });
    expect(layerOrder(next)).toEqual(['base', 'title', 'paper']);
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('moves a mask source into the masked stack', async () => {
    const doc = maskDoc();
    const next = edited(moveTreeRow(doc, 'matte', 'mask', 'below'));

    expect(outline(next).output).toEqual([{ mask: { Mask: ['soften'] } }, 'matte', 'source']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['matte>soften.in', 'source>mask.in'],
      added: ['matte>mask.in', 'source>matte.bg'],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('moves a repeat item out of the pattern source', async () => {
    const doc = repeatDoc();
    const next = edited(moveTreeRow(doc, 'item', 'repeat', 'above'));

    expect(outline(next).output).toEqual(['item', 'repeat', 'backdrop']);
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['item>repeat.in', `repeat>${EXPORT_NODE_ID}.in`],
      added: [`item>${EXPORT_NODE_ID}.in`, 'repeat>item.bg'],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('moves a row into a Scene 3D environment stack below its top', async () => {
    const doc = sceneDoc();
    const next = edited(moveTreeRow(doc, 'backdrop', 'env', 'below'));

    expect(edgeDiff(doc, next)).toEqual({
      removed: ['backdrop>scene.bg', 'sky>env.in'],
      added: ['backdrop>env.in', 'sky>backdrop.bg'],
    });
    await expectDocumentTreeMatchesRenderer(next, ['sphere', 'chrome']);
  });

  it('moves a row into and out of Not in output', async () => {
    const doc = linearDoc();
    const out = edited(moveTreeRow(doc, 'mid', 'spare', 'above'));
    expect(outline(out)).toEqual({ output: ['top', 'grade', 'base'], notInOutput: [['mid', 'spare']] });
    expect(edgeDiff(doc, out)).toEqual({
      removed: ['base>mid.bg', 'mid>grade.in'],
      added: ['base>grade.in', 'spare>mid.bg'],
    });
    await expectDocumentTreeMatchesRenderer(out);

    const back = edited(moveTreeRow(out, 'spare', 'grade', 'below'));
    expect(outline(back)).toEqual({ output: ['top', 'grade', 'spare', 'base'], notInOutput: [['mid']] });
    await expectDocumentTreeMatchesRenderer(back);
  });
});

describe('blocked moves', () => {
  it('blocks shared nodes, side-input tops, locked layers, and rows with their own inputs across runs', () => {
    const fanOut = buildGraphTreeEditIndex(fanOutDoc());
    expect(checkTreeRowMovable(fanOut, 'shared')).toEqual({
      ok: false,
      reason: 'shared feeds more than one input. Rewire it in Nodes.',
    });

    const scene = buildGraphTreeEditIndex(sceneDoc());
    expect(checkTreeRowMovable(scene, 'sphere')).toEqual({
      ok: false,
      reason: 'sphere is an input of 3D Scene. Change inputs in Nodes.',
    });
    expect(checkTreeMove(scene, 'backdrop', 'env', 'above')).toEqual({
      ok: false,
      reason: 'Inputs of 3D Scene are wired in Nodes.',
    });
    expect(checkTreeMove(scene, 'backdrop', 'sphere', 'below')).toEqual({
      ok: false,
      reason: 'Nothing can be placed below sphere.',
    });

    const merge = buildGraphTreeEditIndex(mergeDoc());
    expect(checkTreeMove(merge, 'merge', 'grade', 'above')).toEqual({
      ok: false,
      reason: 'Merge has its own inputs, so it only moves within its stack. Move it in Nodes.',
    });

    const locked = linearDoc();
    locked.layers = locked.layers.map((layer) => (layer.id === 'mid' ? { ...layer, locked: true } : layer));
    expect(blockedReason(moveTreeRow(locked, 'mid', 'top', 'above'))).toBe('mid is locked. Unlock it to move it.');
  });

  it('blocks drops onto reference rows and steps past them', () => {
    const doc = fanOutDoc();
    const index = buildGraphTreeEditIndex(doc);
    expect(checkTreeDrop(index, 'title', { nodeId: 'shared', reference: true }, 'above')).toEqual({
      ok: false,
      reason: 'Rows can’t be dropped onto a shared use. Drop next to the full entry instead.',
    });
    expect(checkTreeDrop(index, 'title', { nodeId: 'move', reference: false }, 'above').ok).toBe(true);
  });

  it('blocks a source that cannot composite over an input from moving above another row', () => {
    const doc = documentOf(
      [fill('base')],
      graphOf({
        shaderNodes: [makeGraphShaderNode({ id: 'gradient', role: 'fill' })],
        transformNodes: [makeGraphTransformNode({ id: 'move' })],
        edges: [edge('gradient', 'move', 'in'), edge('move', 'base', 'bg'), edge('base', EXPORT_NODE_ID, 'in')],
      }),
    );
    expect(blockedReason(moveTreeRow(doc, 'gradient', 'base', 'below'))).toBe('Shader can’t sit above other rows.');
    expect(moveTreeRow(doc, 'gradient', 'base', 'above').ok).toBe(false);
  });

  it('returns the same document for a drop next to the row itself', () => {
    const doc = linearDoc();
    expect(edited(moveTreeRow(doc, 'grade', 'top', 'below'))).toBe(doc);
    expect(edited(moveTreeRow(doc, 'grade', 'mid', 'above'))).toBe(doc);
  });
});

describe('add above the selected row', () => {
  it('inserts between the row and its consumer on the consumer’s original port', async () => {
    const doc = mergeDoc();
    const layer = fill('new', '#ff8800', 50);
    const next = addLayerAboveTreeRow(doc, layer, 'title')!;

    expect(outline(next).output).toEqual([{ merge: { Group: ['grade', 'new', 'title'] } }, 'paper', 'base']);
    expect(edgeDiff(doc, next)).toEqual({ removed: ['title>grade.in'], added: ['new>grade.in', 'title>new.bg'] });
    expect(layerOrder(next)).toEqual(['base', 'paper', 'title', 'new']);
    expect(next.graph!.positions.new).toBeDefined();
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('inserts above the top of a stack on Output, a merge b, and a mask', async () => {
    const outputDoc = addLayerAboveTreeRow(linearDoc(), fill('new'), 'top')!;
    expect(outline(outputDoc).output).toEqual(['new', 'top', 'grade', 'mid', 'base']);

    const groupDoc = addLayerAboveTreeRow(mergeDoc(), fill('new'), 'grade')!;
    expect(edgeDiff(mergeDoc(), groupDoc)).toEqual({
      removed: ['grade>merge.b'],
      added: ['grade>new.bg', 'new>merge.b'],
    });

    const maskTopDoc = addLayerAboveTreeRow(maskDoc(), fill('new'), 'soften')!;
    expect(outline(maskTopDoc).output).toEqual([{ mask: { Mask: ['new', 'soften', 'matte'] } }, 'source']);
    await expectDocumentTreeMatchesRenderer(maskTopDoc);
  });

  it('refuses side-input tops so the caller falls back to adding before Output', () => {
    const index = buildGraphTreeEditIndex(sceneDoc());
    expect(checkTreeInsertAbove(index, 'env').ok).toBe(false);
    expect(checkTreeInsertAbove(index, 'sky').ok).toBe(true);
    expect(addLayerAboveTreeRow(sceneDoc(), fill('new'), 'chrome')).toBeNull();
  });
});

describe('delete', () => {
  it('reconnects upstream to downstream in a run', async () => {
    const doc = linearDoc();
    const next = edited(deleteTreeNode(doc, 'grade'));
    expect(outline(next).output).toEqual(['top', 'mid', 'base']);
    expect(edgeDiff(doc, next)).toEqual({ removed: ['grade>top.bg', 'mid>grade.in'], added: ['mid>top.bg'] });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('reconnects a merge a input and drops its b input', async () => {
    const doc = mergeDoc();
    const next = edited(deleteTreeNode(doc, 'merge'));
    expect(outline(next)).toEqual({ output: ['paper', 'base'], notInOutput: [['grade', 'title']] });
    expect(edgeDiff(doc, next)).toEqual({
      removed: ['grade>merge.b', `merge>${EXPORT_NODE_ID}.in`, 'paper>merge.a'],
      added: [`paper>${EXPORT_NODE_ID}.in`],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('reconnects the masked source and the repeat backdrop, dropping the mask and the item', async () => {
    const mask = edited(deleteTreeNode(maskDoc(), 'mask'));
    expect(outline(mask)).toEqual({ output: ['source'], notInOutput: [['soften', 'matte']] });
    await expectDocumentTreeMatchesRenderer(mask);

    const repeat = edited(deleteTreeNode(repeatDoc(), 'repeat'));
    expect(outline(repeat)).toEqual({ output: ['backdrop'], notInOutput: [['item']] });
    await expectDocumentTreeMatchesRenderer(repeat);
  });

  it('drops side inputs instead of rewiring them', async () => {
    const doc = sceneDoc();
    const withoutEnv = edited(deleteTreeNode(doc, 'env'));
    expect(edgeDiff(doc, withoutEnv)).toEqual({ removed: ['env>scene.env', 'sky>env.in'], added: [] });
    await expectDocumentTreeMatchesRenderer(withoutEnv, ['sphere', 'chrome']);

    const withoutScene = edited(deleteTreeNode(doc, 'scene'));
    expect(outline(withoutScene).output).toEqual(['backdrop']);
    expect(edgeDiff(doc, withoutScene).added).toEqual([`backdrop>${EXPORT_NODE_ID}.in`]);
    await expectDocumentTreeMatchesRenderer(withoutScene);
  });

  it('reconnects every consumer of a shared node and reports it as shared', async () => {
    const doc = fanOutDoc();
    expect(graphNodeConsumerCount(doc, 'shared')).toBe(2);
    expect(graphNodeConsumerCount(doc, 'move')).toBe(1);

    const middle = documentOf([...doc.layers, fill('under')], {
      ...doc.graph!,
      edges: [...doc.graph!.edges, edge('under', 'shared', 'bg')],
    });
    const next = edited(deleteTreeNode(middle, 'shared'));
    expect(edgeDiff(middle, next)).toEqual({
      removed: ['shared>merge.b', 'shared>move.in', 'under>shared.bg'],
      added: ['under>merge.b', 'under>move.in'],
    });
    await expectDocumentTreeMatchesRenderer(next);
  });

  it('skips locked layers and deletes the rest in one update', () => {
    const doc = linearDoc();
    doc.layers = doc.layers.map((layer) => (layer.id === 'mid' ? { ...layer, locked: true } : layer));
    expect(blockedReason(deleteTreeNode(doc, 'mid'))).toBe('Locked layers can’t be deleted. Unlock it first.');
    const next = deleteTreeNodes(doc, ['mid', 'grade']);
    expect(outline(next).output).toEqual(['top', 'mid', 'base']);
  });
});

describe('doc.layers consistency', () => {
  /** Output ← b ← c ← a: a layer-only custom graph whose chain disagrees with doc.layers. Opaque fills, so the top one shows. */
  function scrambledChain() {
    return documentOf(
      [fill('a', '#ff0000'), fill('b', '#00ff00'), fill('c', '#0000ff')],
      graphOf({ edges: [edge('a', 'c', 'bg'), edge('c', 'b', 'bg'), edge('b', EXPORT_NODE_ID, 'in')] }),
    );
  }

  it('keeps a layer chain bottom-to-top, so an edited chain is the layer stack again', async () => {
    const doc = scrambledChain();
    expect(isLayerStackGraph(doc)).toBe(false);

    const next = edited(moveTreeRow(doc, 'b', 'c', 'below'));
    expect(outline(next).output).toEqual(['c', 'b', 'a']);
    expect(layerOrder(next)).toEqual(['a', 'b', 'c']);
    expect(isLayerStackGraph(next)).toBe(true);

    // Stack-mode rendering of doc.layers now draws the same picture as the graph; before the edit it did not.
    const render = async (target: CanvasDocument, graphMode?: 'stack') =>
      allPixels(await renderDocument(target, 32, 32, new Map(), { skipEffects: true, graphMode }));
    expect(pixelsEqual(await render(doc), await render(doc, 'stack'))).toBe(false);
    expect(pixelsEqual(await render(next), await render(next, 'stack'))).toBe(true);
  });

  it('makes a graph the layer stack again once its last utility node is deleted', () => {
    const next = edited(deleteTreeNode(linearDoc(), 'grade'));
    const withoutSpare = edited(deleteTreeNode(next, 'spare'));
    expect(isLayerStackGraph(withoutSpare)).toBe(true);
  });

  it('round-trips a tree edit through a project package', async () => {
    const next = edited(moveTreeRow(mergeDoc(), 'paper', 'grade', 'below'));
    const projectPackage = await prepareArtifactProjectPackage(next);
    const parsed = parseArtifactProjectPackage(serializeArtifactProjectPackage(projectPackage));
    const imported = await importArtifactProjectPackage(parsed!);

    expect(outline(imported)).toEqual(outline(next));
    expect(imported.graph!.edges.map(edgeKey)).toEqual(next.graph!.edges.map(edgeKey));
    expect(layerOrder(imported)).toEqual(layerOrder(next));
  });
});
