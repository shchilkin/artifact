import type { CSSProperties } from 'react';
import type { Layer } from '../../types/config';

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
  };
}
