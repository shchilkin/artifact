import { assign, setup } from 'xstate';

import type { ContextMenuState, NodeCanvasUiAction, NodeCanvasUiState } from './types';

// ---------------------------------------------------------------------------
// Context + Events
// ---------------------------------------------------------------------------

interface NodeCanvasMachineContext extends NodeCanvasUiState {
  contextMenu: ContextMenuState;
  galleryNodeId: string | null;
}

export type NodeCanvasMachineEvent =
  | NodeCanvasUiAction
  | { type: 'CONTEXT_MENU_OPENED'; menu: ContextMenuState }
  | { type: 'CONTEXT_MENU_CLOSED' }
  | { type: 'GALLERY_OPENED'; nodeId: string }
  | { type: 'GALLERY_CLOSED' };

// ---------------------------------------------------------------------------
// Pure helpers (also exported for tests)
// ---------------------------------------------------------------------------

function computeNextNodeIds(current: string[], id: string | null, additive: boolean): string[] {
  if (!id) return [];
  if (!additive) return [id];
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const nodeCanvasMachine = setup({
  types: {
    context: {} as NodeCanvasMachineContext,
    events: {} as NodeCanvasMachineEvent,
    input: {} as { selectedNodeIds?: string[] },
  },

  guards: {
    /** NODE_SELECTED results in an empty selection (deselect last node). */
    nodeSelectionBecomesEmpty: ({ context, event }) => {
      if (event.type !== 'NODE_SELECTED') return false;
      return computeNextNodeIds(context.selectedNodeIds, event.id, event.additive).length === 0;
    },
    /** SELECTION_CHANGED carries at least one node. */
    hasNodes: ({ event }) => event.type === 'SELECTION_CHANGED' && event.nodeIds.length > 0,
    /** SELECTION_CHANGED carries exactly one edge, no nodes. */
    hasEdgeOnly: ({ event }) =>
      event.type === 'SELECTION_CHANGED' && event.nodeIds.length === 0 && event.edgeIds.length === 1,
    /** NODE_EDITOR_TOGGLED is toggling the currently-open editor off. */
    isSameEditor: ({ context, event }) => event.type === 'NODE_EDITOR_TOGGLED' && context.expandedNodeId === event.id,
    /** EDGE_IDS_REMOVED includes the currently-selected edge. */
    selectedEdgeRemoved: ({ context, event }) =>
      event.type === 'EDGE_IDS_REMOVED' && context.selectedEdgeId != null && event.ids.includes(context.selectedEdgeId),
  },

  actions: {
    clearSelection: assign({
      selectedNodeIds: [],
      selectedEdgeId: null,
      expandedNodeId: null,
    }),

    updateNodeSelection: assign({
      selectedNodeIds: ({ context, event }) => {
        if (event.type !== 'NODE_SELECTED') return context.selectedNodeIds;
        return computeNextNodeIds(context.selectedNodeIds, event.id, event.additive);
      },
      selectedEdgeId: null,
      expandedNodeId: ({ context, event }) => {
        if (event.type !== 'NODE_SELECTED') return context.expandedNodeId;
        if (event.additive) {
          const next = computeNextNodeIds(context.selectedNodeIds, event.id, true);
          return context.expandedNodeId && next.includes(context.expandedNodeId) ? context.expandedNodeId : null;
        }
        return context.expandedNodeId === event.id ? context.expandedNodeId : null;
      },
    }),

    selectEdge: assign({
      selectedNodeIds: [],
      selectedEdgeId: ({ event }) => (event.type === 'EDGE_SELECTED' ? event.id : null),
      expandedNodeId: null,
    }),

    openEditor: assign({
      selectedNodeIds: ({ event }) => (event.type === 'NODE_EDITOR_TOGGLED' ? [event.id] : []),
      selectedEdgeId: null,
      expandedNodeId: ({ event }) => (event.type === 'NODE_EDITOR_TOGGLED' ? event.id : null),
    }),

    closeEditor: assign({ expandedNodeId: null }),

    applySelectionChanged: assign({
      selectedNodeIds: ({ event }) => (event.type === 'SELECTION_CHANGED' ? event.nodeIds : []),
      selectedEdgeId: ({ event }) => {
        if (event.type !== 'SELECTION_CHANGED') return null;
        return event.nodeIds.length === 0 && event.edgeIds.length === 1 ? event.edgeIds[0] : null;
      },
      expandedNodeId: ({ context, event }) => {
        if (event.type !== 'SELECTION_CHANGED') return null;
        return event.nodeIds.length === 1 && event.nodeIds[0] === context.expandedNodeId
          ? context.expandedNodeId
          : null;
      },
    }),

    filterRemovedEdge: assign({
      selectedEdgeId: ({ context, event }) => {
        if (event.type !== 'EDGE_IDS_REMOVED') return context.selectedEdgeId;
        return event.ids.includes(context.selectedEdgeId ?? '') ? null : context.selectedEdgeId;
      },
    }),

    filterRemovedNodes: assign({
      selectedNodeIds: ({ context, event }) => {
        if (event.type !== 'NODE_IDS_REMOVED') return context.selectedNodeIds;
        return context.selectedNodeIds.filter((id) => !event.ids.includes(id));
      },
      expandedNodeId: ({ context, event }) => {
        if (event.type !== 'NODE_IDS_REMOVED') return context.expandedNodeId;
        return context.expandedNodeId && event.ids.includes(context.expandedNodeId) ? null : context.expandedNodeId;
      },
    }),

    syncExternalNode: assign({
      selectedNodeIds: ({ event }) => (event.type === 'SYNC_EXTERNAL_NODE' ? [event.id] : []),
      selectedEdgeId: null,
      expandedNodeId: ({ context, event }) => {
        if (event.type !== 'SYNC_EXTERNAL_NODE') return context.expandedNodeId;
        return context.expandedNodeId === event.id ? context.expandedNodeId : null;
      },
    }),

    filterInvalidRefs: assign({
      selectedNodeIds: ({ context, event }) => {
        if (event.type !== 'FILTER_INVALID_REFERENCES') return context.selectedNodeIds;
        const valid = new Set(event.validNodeIds);
        return context.selectedNodeIds.filter((id) => valid.has(id));
      },
      selectedEdgeId: ({ context, event }) => {
        if (event.type !== 'FILTER_INVALID_REFERENCES') return context.selectedEdgeId;
        const valid = new Set(event.validEdgeIds);
        return context.selectedEdgeId && valid.has(context.selectedEdgeId) ? context.selectedEdgeId : null;
      },
      expandedNodeId: ({ context, event }) => {
        if (event.type !== 'FILTER_INVALID_REFERENCES') return context.expandedNodeId;
        const valid = new Set(event.validNodeIds);
        return context.expandedNodeId && valid.has(context.expandedNodeId) ? context.expandedNodeId : null;
      },
    }),

    openContextMenu: assign({
      contextMenu: ({ event }) => (event.type === 'CONTEXT_MENU_OPENED' ? event.menu : null),
    }),

    closeContextMenu: assign({ contextMenu: null }),

    openGallery: assign({
      galleryNodeId: ({ event }) => (event.type === 'GALLERY_OPENED' ? event.nodeId : null),
    }),

    closeGallery: assign({ galleryNodeId: null }),
  },
}).createMachine({
  id: 'nodeCanvas',
  type: 'parallel',

  context: ({ input }) => ({
    selectedNodeIds: input?.selectedNodeIds ?? [],
    selectedEdgeId: null,
    expandedNodeId: null,
    contextMenu: null,
    galleryNodeId: null,
  }),

  states: {
    // -----------------------------------------------------------------------
    // Selection region — tracks what is selected in the canvas
    // -----------------------------------------------------------------------
    selection: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            NODE_SELECTED: [
              { guard: 'nodeSelectionBecomesEmpty', actions: 'clearSelection' },
              { target: 'nodeSelected', actions: 'updateNodeSelection' },
            ],
            EDGE_SELECTED: { target: 'edgeSelected', actions: 'selectEdge' },
            NODE_EDITOR_TOGGLED: { target: 'nodeSelected.editorOpen', actions: 'openEditor' },
            SYNC_EXTERNAL_NODE: { target: 'nodeSelected', actions: 'syncExternalNode' },
            SELECTION_CHANGED: [
              { guard: 'hasNodes', target: 'nodeSelected', actions: 'applySelectionChanged' },
              { guard: 'hasEdgeOnly', target: 'edgeSelected', actions: 'applySelectionChanged' },
              { actions: 'applySelectionChanged' },
            ],
            FILTER_INVALID_REFERENCES: { actions: 'filterInvalidRefs' },
          },
        },

        nodeSelected: {
          initial: 'normal',
          on: {
            PANE_CLICKED: { target: 'idle', actions: 'clearSelection' },
            NODE_SELECTED: [
              { guard: 'nodeSelectionBecomesEmpty', target: 'idle', actions: 'clearSelection' },
              { actions: 'updateNodeSelection' },
            ],
            EDGE_SELECTED: { target: 'edgeSelected', actions: 'selectEdge' },
            SYNC_EXTERNAL_NODE: { target: 'nodeSelected', actions: 'syncExternalNode' },
            SELECTION_CHANGED: [
              { guard: 'hasNodes', target: 'nodeSelected', actions: 'applySelectionChanged' },
              { guard: 'hasEdgeOnly', target: 'edgeSelected', actions: 'applySelectionChanged' },
              { target: 'idle', actions: 'applySelectionChanged' },
            ],
            NODE_IDS_REMOVED: { actions: 'filterRemovedNodes' },
            EDGE_IDS_REMOVED: { actions: 'filterRemovedEdge' },
            FILTER_INVALID_REFERENCES: { actions: 'filterInvalidRefs' },
          },
          states: {
            normal: {
              on: {
                NODE_EDITOR_TOGGLED: { target: 'editorOpen', actions: 'openEditor' },
              },
            },
            editorOpen: {
              on: {
                NODE_EDITOR_TOGGLED: [
                  { guard: 'isSameEditor', target: 'normal', actions: 'closeEditor' },
                  { actions: 'openEditor' },
                ],
                PANE_CLICKED: { target: '#nodeCanvas.selection.idle', actions: 'clearSelection' },
              },
            },
          },
        },

        edgeSelected: {
          on: {
            PANE_CLICKED: { target: 'idle', actions: 'clearSelection' },
            NODE_SELECTED: [
              { guard: 'nodeSelectionBecomesEmpty', target: 'idle', actions: 'clearSelection' },
              { target: 'nodeSelected', actions: 'updateNodeSelection' },
            ],
            EDGE_SELECTED: { actions: 'selectEdge' },
            SYNC_EXTERNAL_NODE: { target: 'nodeSelected', actions: 'syncExternalNode' },
            SELECTION_CHANGED: [
              { guard: 'hasNodes', target: 'nodeSelected', actions: 'applySelectionChanged' },
              { guard: 'hasEdgeOnly', actions: 'applySelectionChanged' },
              { target: 'idle', actions: 'applySelectionChanged' },
            ],
            EDGE_IDS_REMOVED: [
              { guard: 'selectedEdgeRemoved', target: 'idle', actions: 'clearSelection' },
              { actions: 'filterRemovedEdge' },
            ],
            FILTER_INVALID_REFERENCES: { actions: 'filterInvalidRefs' },
          },
        },
      },
    },

    // -----------------------------------------------------------------------
    // Overlay region — tracks modal overlays (context menu, gallery)
    // These are independent of selection; a single event fires in both regions.
    // -----------------------------------------------------------------------
    overlay: {
      initial: 'none',
      states: {
        none: {
          on: {
            CONTEXT_MENU_OPENED: { target: 'contextMenu', actions: 'openContextMenu' },
            GALLERY_OPENED: { target: 'gallery', actions: 'openGallery' },
          },
        },
        contextMenu: {
          on: {
            CONTEXT_MENU_CLOSED: { target: 'none', actions: 'closeContextMenu' },
            PANE_CLICKED: { target: 'none', actions: 'closeContextMenu' },
            NODE_SELECTED: { target: 'none', actions: 'closeContextMenu' },
            EDGE_SELECTED: { target: 'none', actions: 'closeContextMenu' },
            GALLERY_OPENED: { target: 'gallery', actions: ['closeContextMenu', 'openGallery'] },
          },
        },
        gallery: {
          on: {
            GALLERY_CLOSED: { target: 'none', actions: 'closeGallery' },
            PANE_CLICKED: { target: 'none', actions: 'closeGallery' },
          },
        },
      },
    },
  },
});
