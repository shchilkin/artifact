import type { NodeCanvasUiAction, NodeCanvasUiState } from './types';

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameState(a: NodeCanvasUiState, b: NodeCanvasUiState) {
  return (
    sameIds(a.selectedNodeIds, b.selectedNodeIds) &&
    a.selectedEdgeId === b.selectedEdgeId &&
    a.expandedNodeId === b.expandedNodeId
  );
}

function emptyState(): NodeCanvasUiState {
  return { selectedNodeIds: [], selectedEdgeId: null, expandedNodeId: null };
}

function keepPreviousIfSame(state: NodeCanvasUiState, nextState: NodeCanvasUiState) {
  return sameState(state, nextState) ? state : nextState;
}

function nextSelectedNodeIds(state: NodeCanvasUiState, action: Extract<NodeCanvasUiAction, { type: 'NODE_SELECTED' }>) {
  if (!action.id) return [];
  if (!action.additive) return [action.id];
  return state.selectedNodeIds.includes(action.id)
    ? state.selectedNodeIds.filter((selectedId) => selectedId !== action.id)
    : [...state.selectedNodeIds, action.id];
}

function nextExpandedNodeId(
  state: NodeCanvasUiState,
  action: Extract<NodeCanvasUiAction, { type: 'NODE_SELECTED' }>,
  selectedNodeIds: string[],
) {
  if (action.additive) {
    return state.expandedNodeId && selectedNodeIds.includes(state.expandedNodeId) ? state.expandedNodeId : null;
  }
  return state.expandedNodeId === action.id ? state.expandedNodeId : null;
}

function reduceNodeSelected(state: NodeCanvasUiState, action: Extract<NodeCanvasUiAction, { type: 'NODE_SELECTED' }>) {
  const selectedNodeIds = nextSelectedNodeIds(state, action);
  return keepPreviousIfSame(state, {
    selectedNodeIds,
    selectedEdgeId: null,
    expandedNodeId: nextExpandedNodeId(state, action, selectedNodeIds),
  });
}

function reduceNodeEditorToggled(
  state: NodeCanvasUiState,
  action: Extract<NodeCanvasUiAction, { type: 'NODE_EDITOR_TOGGLED' }>,
) {
  return keepPreviousIfSame(state, {
    selectedNodeIds: [action.id],
    selectedEdgeId: null,
    expandedNodeId: state.expandedNodeId === action.id ? null : action.id,
  });
}

function reduceSelectionChanged(
  state: NodeCanvasUiState,
  action: Extract<NodeCanvasUiAction, { type: 'SELECTION_CHANGED' }>,
) {
  return keepPreviousIfSame(state, {
    selectedNodeIds: action.nodeIds,
    selectedEdgeId: action.nodeIds.length === 0 && action.edgeIds.length === 1 ? action.edgeIds[0] : null,
    expandedNodeId:
      action.nodeIds.length === 1 && action.nodeIds[0] === state.expandedNodeId ? state.expandedNodeId : null,
  });
}

function reduceSyncExternalNode(
  state: NodeCanvasUiState,
  action: Extract<NodeCanvasUiAction, { type: 'SYNC_EXTERNAL_NODE' }>,
) {
  return keepPreviousIfSame(state, {
    selectedNodeIds: [action.id],
    selectedEdgeId: null,
    expandedNodeId: state.expandedNodeId === action.id ? state.expandedNodeId : null,
  });
}

function reduceFilterInvalidReferences(
  state: NodeCanvasUiState,
  action: Extract<NodeCanvasUiAction, { type: 'FILTER_INVALID_REFERENCES' }>,
) {
  const validNodeIds = new Set(action.validNodeIds);
  const validEdgeIds = new Set(action.validEdgeIds);
  const selectedNodeIds = state.selectedNodeIds.filter((id) => validNodeIds.has(id));

  return keepPreviousIfSame(state, {
    selectedNodeIds,
    selectedEdgeId: state.selectedEdgeId && validEdgeIds.has(state.selectedEdgeId) ? state.selectedEdgeId : null,
    expandedNodeId: state.expandedNodeId && validNodeIds.has(state.expandedNodeId) ? state.expandedNodeId : null,
  });
}

export function reduceNodeCanvasUi(state: NodeCanvasUiState, action: NodeCanvasUiAction): NodeCanvasUiState {
  switch (action.type) {
    case 'PANE_CLICKED':
      return state.selectedNodeIds.length === 0 && state.selectedEdgeId === null && state.expandedNodeId === null
        ? state
        : emptyState();
    case 'NODE_SELECTED':
      return reduceNodeSelected(state, action);
    case 'NODE_EDITOR_TOGGLED':
      return reduceNodeEditorToggled(state, action);
    case 'EDGE_SELECTED':
      return state.selectedNodeIds.length === 0 && state.selectedEdgeId === action.id && state.expandedNodeId === null
        ? state
        : { selectedNodeIds: [], selectedEdgeId: action.id, expandedNodeId: null };
    case 'SELECTION_CHANGED':
      return reduceSelectionChanged(state, action);
    case 'EDGE_IDS_REMOVED':
      return action.ids.includes(state.selectedEdgeId ?? '') ? { ...state, selectedEdgeId: null } : state;
    case 'NODE_IDS_REMOVED': {
      const nextNodeIds = state.selectedNodeIds.filter((id) => !action.ids.includes(id));
      return {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: state.selectedEdgeId,
        expandedNodeId: state.expandedNodeId && action.ids.includes(state.expandedNodeId) ? null : state.expandedNodeId,
      };
    }
    case 'SYNC_EXTERNAL_NODE':
      return reduceSyncExternalNode(state, action);
    case 'FILTER_INVALID_REFERENCES':
      return reduceFilterInvalidReferences(state, action);
  }
}
