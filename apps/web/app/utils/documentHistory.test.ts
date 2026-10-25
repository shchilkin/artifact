import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  type CanvasGraph,
  makeDocument,
  makeEffectLayer,
  makeFillLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import {
  appendHistoryEntry,
  createDocumentHistoryState,
  createHistoryEntry,
  createPendingHistoryEntry,
  type DocumentHistoryEvent,
  type DocumentHistoryState,
  documentHistoryReducer,
  flushPendingHistory,
  HISTORY_MAX,
  type HistoryEntry,
  pushSnapshotHistory,
  redoHistory,
  undoHistory,
} from './documentHistory';

import { graphNodesById, graphNodesOfKind } from './nodeGraph';
import { makeGraphMaterialNode, makeGraphShaderNode } from './nodeKinds';

function makeDoc(seed: number): CanvasDocument {
  return makeDocument({
    global: { bg: '#000000', seed, aspect: '1:1' },
    layers: [seed % 2 === 0 ? makeFillLayer({ id: `fill-${seed}` }) : makeTextLayer({ id: `text-${seed}` })],
    export: { format: 'png', scale: 1, target: 'cover' },
  });
}

function makeGraphDoc(x: number): CanvasDocument {
  const graph: CanvasGraph = {
    edges: [{ id: 'e-fill-export', fromId: 'fill-graph', fromPort: 'out', toId: '__export__', toPort: 'in' }],
    positions: { 'fill-graph': { x, y: 80 }, __export__: { x: 216, y: 80 } },
    nodes: graphNodesById(),
  };

  return {
    global: { bg: '#000000', seed: 88, aspect: '1:1' },
    layers: [makeFillLayer({ id: 'fill-graph' })],
    graph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function makeShaderMaterialGraphDoc(shaderKind: 'waterCaustic' | 'glowingWave'): CanvasDocument {
  const source = makeFillLayer({ id: 'shader-effect-source', color: '#2244ff', opacity: 100, blendMode: 'normal' });
  const effect = makeEffectLayer({
    id: 'shader-effect-a',
    preset: 'gradientMap',
    gradientMap: 85,
    gradientMapShadow: '#041020',
    gradientMapMid: '#3ce4b4',
    gradientMapHighlight: '#ffe98a',
  });
  const primitive = makeSourceLayer('primitive', {
    id: 'primitive-a',
    primitiveShape: 'sphere',
    color: '#773322',
    accentColor: '#ffd180',
  });
  const graph: CanvasGraph = {
    edges: [
      { id: 'e-shader-albedo', fromId: 'shader-a', fromPort: 'out', toId: 'material-a', toPort: 'albedo' },
      { id: 'e-source-effect', fromId: source.id, fromPort: 'out', toId: effect.id, toPort: 'in' },
      { id: 'e-effect-normal', fromId: effect.id, fromPort: 'out', toId: 'material-a', toPort: 'normal' },
      { id: 'e-material-primitive', fromId: 'material-a', fromPort: 'out', toId: primitive.id, toPort: 'material' },
      { id: 'e-primitive-export', fromId: primitive.id, fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {},
    nodes: graphNodesById(
      makeGraphMaterialNode({ id: 'material-a', materialPreset: 'plastic' }),
      makeGraphShaderNode({ id: 'shader-a', shaderKind, distortion: 54, grain: 0 }),
    ),
  };

  return {
    global: { bg: 'transparent', seed: 44, aspect: '1:1' },
    layers: [source, effect, primitive],
    graph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

describe('documentHistory', () => {
  it('pushes snapshot updates and clears redo history', () => {
    const current = makeDoc(1);
    const stacks = pushSnapshotHistory(
      { past: [createHistoryEntry(makeDoc(0))], future: [createHistoryEntry(makeDoc(2))] },
      current,
    );

    expect(stacks.past.map((entry) => entry.doc.global.seed)).toEqual([0, 1]);
    expect(stacks.future).toEqual([]);
  });

  it('keeps the first document in a debounced update group', () => {
    const beforeGesture = makeDoc(10);
    const firstPending = createPendingHistoryEntry(beforeGesture, null);
    const secondPending = createPendingHistoryEntry(makeDoc(11), firstPending);
    const stacks = flushPendingHistory({ past: [], future: [] }, secondPending);

    expect(firstPending).toBe(secondPending);
    expect(stacks.past).toHaveLength(1);
    expect(stacks.past[0]?.doc.global.seed).toBe(10);
  });

  it('does not mutate stored history entries when source documents change later', () => {
    const doc = makeDoc(20);
    const entry = createHistoryEntry(doc);

    doc.layers.push(makeTextLayer({ id: 'late-text' }));

    expect(entry.doc.layers.map((layer) => layer.id)).toEqual(['fill-20']);
  });

  it('moves between undo and redo stacks', () => {
    const current = makeDoc(3);
    const undoResult = undoHistory(
      {
        past: [createHistoryEntry(makeDoc(1)), createHistoryEntry(makeDoc(2))],
        future: [],
      },
      current,
    );

    expect(undoResult?.doc.global.seed).toBe(2);
    expect(undoResult?.past.map((entry) => entry.doc.global.seed)).toEqual([1]);
    expect(undoResult?.future.map((entry) => entry.doc.global.seed)).toEqual([3]);

    const redoResult = redoHistory(
      {
        past: undoResult?.past ?? [],
        future: undoResult?.future ?? [],
      },
      undoResult?.doc ?? current,
    );

    expect(redoResult?.doc.global.seed).toBe(3);
    expect(redoResult?.past.map((entry) => entry.doc.global.seed)).toEqual([1, 2]);
    expect(redoResult?.future).toEqual([]);
  });

  it('preserves graph edits through undo and redo history', () => {
    const beforeGraphEdit = makeGraphDoc(0);
    const afterGraphEdit = makeGraphDoc(120);
    const undoResult = undoHistory(pushSnapshotHistory({ past: [], future: [] }, beforeGraphEdit), afterGraphEdit);

    expect(undoResult?.doc.graph?.positions['fill-graph']).toEqual({ x: 0, y: 80 });

    const redoResult = redoHistory(
      {
        past: undoResult?.past ?? [],
        future: undoResult?.future ?? [],
      },
      undoResult?.doc ?? beforeGraphEdit,
    );

    expect(redoResult?.doc.graph?.positions['fill-graph']).toEqual({ x: 120, y: 80 });
  });

  it('preserves shader material graph nodes and texture-map edges through undo and redo history', () => {
    const beforeGraphEdit = makeShaderMaterialGraphDoc('waterCaustic');
    const afterGraphEdit = makeShaderMaterialGraphDoc('glowingWave');
    const undoResult = undoHistory(pushSnapshotHistory({ past: [], future: [] }, beforeGraphEdit), afterGraphEdit);

    expect(graphNodesOfKind(undoResult?.doc.graph ?? { nodes: {} }, 'shader')?.[0]?.shaderKind).toBe('waterCaustic');
    expect(undoResult?.doc.graph?.edges.map((edge) => edge.toPort)).toEqual([
      'albedo',
      'in',
      'normal',
      'material',
      'in',
    ]);

    const redoResult = redoHistory(
      {
        past: undoResult?.past ?? [],
        future: undoResult?.future ?? [],
      },
      undoResult?.doc ?? beforeGraphEdit,
    );

    expect(graphNodesOfKind(redoResult?.doc.graph ?? { nodes: {} }, 'shader')?.[0]?.shaderKind).toBe('glowingWave');
    expect(graphNodesOfKind(redoResult?.doc.graph ?? { nodes: {} }, 'material')?.[0]?.materialPreset).toBe('plastic');
    expect(redoResult?.doc.layers.find((layer) => layer.id === 'shader-effect-a')).toMatchObject({
      preset: 'gradientMap',
      effects: [{ effect: 'gradientMap', params: { mode: 'tri', amount: 85 } }],
    });
  });

  it('flushes multiple debounced graph edits as one undo entry', () => {
    const beforeGesture = makeGraphDoc(0);
    const firstMove = makeGraphDoc(60);
    const secondMove = makeGraphDoc(120);
    let pending = createPendingHistoryEntry(beforeGesture, null);
    pending = createPendingHistoryEntry(firstMove, pending);
    pending = createPendingHistoryEntry(secondMove, pending);

    const stacks = flushPendingHistory({ past: [], future: [] }, pending);
    const undoResult = undoHistory(stacks, secondMove);

    expect(stacks.past).toHaveLength(1);
    expect(undoResult?.doc.graph?.positions['fill-graph']).toEqual({ x: 0, y: 80 });
    expect(undoResult?.future[0]?.doc.graph?.positions['fill-graph']).toEqual({ x: 120, y: 80 });
  });

  it('caps past history at the configured limit', () => {
    const past = Array.from({ length: HISTORY_MAX + 3 }, (_, index) => createHistoryEntry(makeDoc(index)));
    const capped = appendHistoryEntry(past, createHistoryEntry(makeDoc(999)));

    expect(capped).toHaveLength(HISTORY_MAX);
    expect(capped[0]?.doc.global.seed).toBe(4);
    expect(capped.at(-1)?.doc.global.seed).toBe(999);
  });
});

describe('documentHistoryReducer', () => {
  const docWithSeed = (seed: number): CanvasDocument =>
    makeDocument({
      global: { bg: '#000000', seed, aspect: '1:1' },
      layers: [],
      export: { format: 'png', scale: 1, target: 'cover' },
    });
  const seeds = (entries: HistoryEntry[]) => entries.map((entry) => entry.doc.global.seed);

  function run(events: DocumentHistoryEvent[], initial = docWithSeed(1)): DocumentHistoryState {
    return events.reduce(documentHistoryReducer, createDocumentHistoryState(initial));
  }

  it('records one undo step per snapshot', () => {
    const state = run([
      { type: 'commit', doc: docWithSeed(2), mode: 'snapshot' },
      { type: 'commit', doc: docWithSeed(3), mode: 'snapshot' },
    ]);
    expect(seeds(state.past)).toEqual([1, 2]);
    expect(state.doc.global.seed).toBe(3);
  });

  it('records one undo step for a gesture once it settles', () => {
    const gesture = [2, 3, 4].map(
      (seed): DocumentHistoryEvent => ({ type: 'commit', doc: docWithSeed(seed), mode: 'debounce' }),
    );
    const pending = run(gesture);
    expect(pending.past).toEqual([]);
    expect(pending.pending?.doc.global.seed).toBe(1);
    expect(seeds(documentHistoryReducer(pending, { type: 'settle' }).past)).toEqual([1]);
  });

  it('keeps a gesture undoable when a snapshot follows before it settles', () => {
    const state = run([
      { type: 'commit', doc: docWithSeed(2), mode: 'debounce' },
      { type: 'commit', doc: docWithSeed(3), mode: 'snapshot' },
      { type: 'undo' },
    ]);
    expect(state.doc.global.seed).toBe(2);
    expect(documentHistoryReducer(state, { type: 'undo' }).doc.global.seed).toBe(1);
  });

  it('undoes an unsettled gesture to its start, not one step further', () => {
    const state = run([
      { type: 'commit', doc: docWithSeed(2), mode: 'snapshot' },
      { type: 'commit', doc: docWithSeed(3), mode: 'debounce' },
      { type: 'undo' },
    ]);
    expect(state.doc.global.seed).toBe(2);
    expect(seeds(state.future)).toEqual([3]);
  });

  it('redoes what undo took back and drops redo on a new edit', () => {
    const undone = run([{ type: 'commit', doc: docWithSeed(2), mode: 'snapshot' }, { type: 'undo' }]);
    const redone = documentHistoryReducer(undone, { type: 'redo' });
    expect(redone.doc.global.seed).toBe(2);
    const edited = documentHistoryReducer(undone, { type: 'commit', doc: docWithSeed(5), mode: 'debounce' });
    expect(edited.future).toEqual([]);
  });

  it('applies a silent normalization to every history entry, so undo cannot bring the old form back', () => {
    const withBg =
      (bg: string) =>
      (doc: CanvasDocument): CanvasDocument => ({ ...doc, global: { ...doc.global, bg } });
    const state = run([
      { type: 'commit', doc: docWithSeed(2), mode: 'snapshot' },
      { type: 'commit', doc: docWithSeed(3), mode: 'debounce' },
      { type: 'commit', doc: withBg('#ffffff')(docWithSeed(3)), mode: 'silent', amend: withBg('#ffffff') },
    ]);
    expect(state.doc.global.bg).toBe('#ffffff');
    expect(state.pending?.doc.global.bg).toBe('#ffffff');
    expect(state.past.map((entry) => entry.doc.global.bg)).toEqual(['#ffffff']);
  });

  it('records nothing for a silent write without an amendment', () => {
    const state = run([{ type: 'commit', doc: docWithSeed(2), mode: 'silent' }]);
    expect(state.past).toEqual([]);
    expect(state.doc.global.seed).toBe(2);
  });

  it('caps past history at the configured limit', () => {
    const events = Array.from(
      { length: HISTORY_MAX + 5 },
      (_, i): DocumentHistoryEvent => ({
        type: 'commit',
        doc: docWithSeed(i + 2),
        mode: 'snapshot',
      }),
    );
    expect(run(events).past).toHaveLength(HISTORY_MAX);
  });
});
