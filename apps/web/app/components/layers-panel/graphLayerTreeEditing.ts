import { createContext } from 'react';
import type { CanvasDocument } from '../../types/config';
import type { GraphTreeEditIndex, TreeDropPosition } from '../../utils/graphTreeEdits';

// What the Layers tree needs to be editable (docs/layers-graph-tree.md, "Editing in the tree").
// `useLayerTreeEditing` provides it; `GraphLayerTreeView` reads it.

export interface GraphLayerTreeEditing {
  index: GraphTreeEditIndex;
  /** Id of the element describing the tree's edit keys. */
  helpId: string;
  /** The row being placed from the keyboard (`Move to…`), if any. */
  movingNodeId: string | null;
  actions: GraphLayerTreeEditActions;
}

/** Tree edits. Moves return the edited document, or null when the edit was blocked and announced. */
export interface GraphLayerTreeEditActions {
  move: (nodeId: string, targetId: string, position: TreeDropPosition) => CanvasDocument | null;
  step: (nodeId: string, direction: 'up' | 'down') => CanvasDocument | null;
  deleteRows: (nodeIds: string[]) => void;
  cancelMove: () => void;
  /** Announces why an edit cannot happen. */
  announceBlocked: (reason: string) => void;
  /** Opens tree actions for a graph-only node or a shared use. */
  openNodeMenu: (
    nodeId: string,
    position: { x: number; y: number },
    returnFocusTarget: HTMLElement,
    reference: boolean,
  ) => void;
}

/** Makes the tree editable. Without a provider (the style guide specimen) the tree is read-only. */
export const GraphLayerTreeEditingContext = createContext<GraphLayerTreeEditing | null>(null);
