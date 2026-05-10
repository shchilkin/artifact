import type { NodeCanvasUiAction, NodeCanvasUiState } from './types';

export function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function reduceNodeCanvasUi(state: NodeCanvasUiState, action: NodeCanvasUiAction): NodeCanvasUiState {
  switch (action.type) {
    case 'PANE_CLICKED':
      return state.selectedNodeIds.length === 0 && state.selectedEdgeId === null && state.expandedNodeId === null
        ? state
        : { selectedNodeIds: [], selectedEdgeId: null, expandedNodeId: null };
    case 'NODE_SELECTED': {
      const nextNodeIds = !action.id
        ? []
        : action.additive
          ? (state.selectedNodeIds.includes(action.id)
            ? state.selectedNodeIds.filter((selectedId) => selectedId !== action.id)
            : [...state.selectedNodeIds, action.id])
          : [action.id];
      const nextState = {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: null,
        expandedNodeId: action.additive
          ? (state.expandedNodeId && nextNodeIds.includes(state.expandedNodeId) ? state.expandedNodeId : null)
          : (state.expandedNodeId === action.id ? state.expandedNodeId : null),
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
    case 'NODE_EDITOR_TOGGLED': {
      const nextState = {
        selectedNodeIds: [action.id],
        selectedEdgeId: null,
        expandedNodeId: state.expandedNodeId === action.id ? null : action.id,
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
    case 'EDGE_SELECTED':
      return state.selectedNodeIds.length === 0 && state.selectedEdgeId === action.id && state.expandedNodeId === null
        ? state
        : { selectedNodeIds: [], selectedEdgeId: action.id, expandedNodeId: null };
    case 'SELECTION_CHANGED': {
      const nextState = {
        selectedNodeIds: action.nodeIds,
        selectedEdgeId: action.nodeIds.length === 0 && action.edgeIds.length === 1 ? action.edgeIds[0] : null,
        expandedNodeId: action.nodeIds.length === 1 && action.nodeIds[0] === state.expandedNodeId ? state.expandedNodeId : null,
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
    case 'EDGE_IDS_REMOVED':
      return action.ids.includes(state.selectedEdgeId ?? '')
        ? { ...state, selectedEdgeId: null }
        : state;
    case 'NODE_IDS_REMOVED': {
      const nextNodeIds = state.selectedNodeIds.filter((id) => !action.ids.includes(id));
      return {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: state.selectedEdgeId,
        expandedNodeId: state.expandedNodeId && action.ids.includes(state.expandedNodeId) ? null : state.expandedNodeId,
      };
    }
    case 'SYNC_EXTERNAL_NODE':
      return sameIds(state.selectedNodeIds, [action.id]) && state.selectedEdgeId === null && state.expandedNodeId === (state.expandedNodeId === action.id ? state.expandedNodeId : null)
        ? state
        : {
          selectedNodeIds: [action.id],
          selectedEdgeId: null,
          expandedNodeId: state.expandedNodeId === action.id ? state.expandedNodeId : null,
        };
    case 'FILTER_INVALID_REFERENCES': {
      const validNodeIds = new Set(action.validNodeIds);
      const validEdgeIds = new Set(action.validEdgeIds);
      const nextNodeIds = state.selectedNodeIds.filter((id) => validNodeIds.has(id));
      const nextState = {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: state.selectedEdgeId && validEdgeIds.has(state.selectedEdgeId) ? state.selectedEdgeId : null,
        expandedNodeId: state.expandedNodeId && validNodeIds.has(state.expandedNodeId) ? state.expandedNodeId : null,
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
  }
}
