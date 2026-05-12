import { describe, expect, it } from 'vitest';
import { type CanvasDocument, type CanvasGraph, makeFillLayer, makeTextLayer } from '../types/config';
import {
  appendHistoryEntry,
  createHistoryEntry,
  createPendingHistoryEntry,
  flushPendingHistory,
  HISTORY_MAX,
  pushSnapshotHistory,
  redoHistory,
  undoHistory,
} from './documentHistory';

function makeDoc(seed: number): CanvasDocument {
  return {
    global: { bg: '#000000', seed, aspect: '1:1' },
    layers: [seed % 2 === 0 ? makeFillLayer({ id: `fill-${seed}` }) : makeTextLayer({ id: `text-${seed}` })],
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function makeGraphDoc(x: number): CanvasDocument {
  const graph: CanvasGraph = {
    edges: [{ id: 'e-fill-export', fromId: 'fill-graph', fromPort: 'out', toId: '__export__', toPort: 'in' }],
    positions: { 'fill-graph': { x, y: 80 }, __export__: { x: 216, y: 80 } },
    mergeNodes: [],
    colorNodes: [],
  };

  return {
    global: { bg: '#000000', seed: 88, aspect: '1:1' },
    layers: [makeFillLayer({ id: 'fill-graph' })],
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
