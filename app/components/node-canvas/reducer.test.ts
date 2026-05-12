import { describe, expect, it } from 'vitest';

import { reduceNodeCanvasUi } from './reducer';
import type { NodeCanvasUiState } from './types';

const baseState = (): NodeCanvasUiState => ({
  selectedNodeIds: [],
  selectedEdgeId: null,
  expandedNodeId: null,
});

describe('reduceNodeCanvasUi', () => {
  it('handles PANE_CLICKED', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: ['a'], selectedEdgeId: 'e1', expandedNodeId: 'a' },
        { type: 'PANE_CLICKED' },
      ),
    ).toEqual(baseState());
  });

  it('handles NODE_SELECTED without additive selection', () => {
    expect(reduceNodeCanvasUi(baseState(), { type: 'NODE_SELECTED', id: 'a', additive: false })).toEqual({
      selectedNodeIds: ['a'],
      selectedEdgeId: null,
      expandedNodeId: null,
    });
  });

  it('handles NODE_SELECTED with additive selection', () => {
    const state = { selectedNodeIds: ['a'], selectedEdgeId: null, expandedNodeId: 'a' };
    expect(reduceNodeCanvasUi(state, { type: 'NODE_SELECTED', id: 'b', additive: true })).toEqual({
      selectedNodeIds: ['a', 'b'],
      selectedEdgeId: null,
      expandedNodeId: 'a',
    });
    expect(reduceNodeCanvasUi(state, { type: 'NODE_SELECTED', id: 'a', additive: true })).toEqual(baseState());
  });

  it('handles NODE_EDITOR_TOGGLED', () => {
    expect(reduceNodeCanvasUi(baseState(), { type: 'NODE_EDITOR_TOGGLED', id: 'a' })).toEqual({
      selectedNodeIds: ['a'],
      selectedEdgeId: null,
      expandedNodeId: 'a',
    });
  });

  it('handles EDGE_SELECTED', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: ['a'], selectedEdgeId: null, expandedNodeId: 'a' },
        { type: 'EDGE_SELECTED', id: 'e1' },
      ),
    ).toEqual({ selectedNodeIds: [], selectedEdgeId: 'e1', expandedNodeId: null });
  });

  it('handles SELECTION_CHANGED', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: ['a'], selectedEdgeId: null, expandedNodeId: 'a' },
        { type: 'SELECTION_CHANGED', nodeIds: ['a'], edgeIds: [] },
      ),
    ).toEqual({ selectedNodeIds: ['a'], selectedEdgeId: null, expandedNodeId: 'a' });
    expect(reduceNodeCanvasUi(baseState(), { type: 'SELECTION_CHANGED', nodeIds: [], edgeIds: ['e1'] })).toEqual({
      selectedNodeIds: [],
      selectedEdgeId: 'e1',
      expandedNodeId: null,
    });
  });

  it('handles EDGE_IDS_REMOVED', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: [], selectedEdgeId: 'e1', expandedNodeId: null },
        { type: 'EDGE_IDS_REMOVED', ids: ['e1'] },
      ),
    ).toEqual(baseState());
  });

  it('handles NODE_IDS_REMOVED', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: ['a', 'b'], selectedEdgeId: 'e1', expandedNodeId: 'b' },
        { type: 'NODE_IDS_REMOVED', ids: ['b'] },
      ),
    ).toEqual({ selectedNodeIds: ['a'], selectedEdgeId: 'e1', expandedNodeId: null });
  });

  it('handles SYNC_EXTERNAL_NODE', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: [], selectedEdgeId: 'e1', expandedNodeId: 'a' },
        { type: 'SYNC_EXTERNAL_NODE', id: 'a' },
      ),
    ).toEqual({ selectedNodeIds: ['a'], selectedEdgeId: null, expandedNodeId: 'a' });
  });

  it('handles FILTER_INVALID_REFERENCES', () => {
    expect(
      reduceNodeCanvasUi(
        { selectedNodeIds: ['a', 'b'], selectedEdgeId: 'e1', expandedNodeId: 'b' },
        {
          type: 'FILTER_INVALID_REFERENCES',
          validNodeIds: ['a'],
          validEdgeIds: [],
        },
      ),
    ).toEqual({ selectedNodeIds: ['a'], selectedEdgeId: null, expandedNodeId: null });
  });
});
