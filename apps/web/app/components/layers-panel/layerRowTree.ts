import type { CSSProperties, DragEvent as ReactDragEvent } from 'react';
import type { Layer } from '../../types/config';
import type { TreeDropPosition } from '../../utils/graphTreeEdits';

/** Drag and drop for a row in an editable Layers tree. */
export interface LayerRowTreeDrag {
  draggable: boolean;
  /** The row is being dragged. */
  dragging: boolean;
  /** Where a valid drop would land, drawn as a line on the row's edge. */
  dropPosition: TreeDropPosition | null;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/** Placement of a row in the graph-derived Layers tree; the row renders as an ARIA treeitem. */
export interface LayerRowTreePlacement {
  key: string;
  level: number;
  setSize: number;
  posInSet: number;
  /** Roving tab stop: only the active tree item is in the tab order. */
  focusable: boolean;
  label: string;
  /** Present when the row has nested inputs that can be expanded or collapsed. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Present when the tree can be edited. */
  drag?: LayerRowTreeDrag;
}

export function layerKindLabel(layer: Layer) {
  if (layer.kind === 'emoji') return 'emoji';
  if (layer.kind === 'primitive') return '3d';
  return layer.kind;
}

/** ARIA treeitem attributes and indentation for a row placed in the graph-derived Layers tree. */
export function layerTreeItemProps(tree: LayerRowTreePlacement, selected: boolean, areaColor?: string) {
  const style = { '--layer-tree-level': tree.level, '--layer-area-color': areaColor } as CSSProperties;
  return {
    role: 'treeitem',
    'aria-level': tree.level,
    'aria-setsize': tree.setSize,
    'aria-posinset': tree.posInSet,
    'aria-selected': selected,
    'aria-expanded': tree.expanded,
    'aria-label': tree.label,
    tabIndex: tree.focusable ? 0 : -1,
    'data-tree-key': tree.key,
    'data-area-rail': areaColor ? 'true' : undefined,
    style,
    ...treeDragProps(tree.drag),
  };
}

function treeDragProps(drag: LayerRowTreeDrag | undefined) {
  if (!drag) return {};
  return {
    draggable: drag.draggable,
    'data-tree-dragging': drag.dragging ? 'true' : undefined,
    'data-tree-drop': drag.dropPosition ?? undefined,
    onDragStart: drag.onDragStart,
    onDragOver: drag.onDragOver,
    onDrop: drag.onDrop,
    onDragEnd: drag.onDragEnd,
  };
}
