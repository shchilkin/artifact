import type { GraphLayerTree, GraphTreeGroup, GraphTreeRow } from '../../utils/graphLayerTree';

// Flattens the graph-derived Layers tree into the rows currently visible, with ARIA tree positions.
// Collapse state is UI state keyed by structural folder keys (derived from node ids), never document state.

export const NOT_IN_OUTPUT_KEY = '__not-in-output__';

/** Folder keys whose rows are hidden; a key not in the map uses `defaultFolderCollapsed`. */
export type GraphTreeCollapseState = ReadonlyMap<string, boolean>;

export type GraphTreeFolderKind = 'mask' | 'pattern' | 'inputs' | 'input' | 'notInOutput';

interface GraphTreeItemBase {
  key: string;
  level: number;
  setSize: number;
  posInSet: number;
  parentKey: string | null;
  /** The collapse-state key for items that can be expanded or collapsed. */
  folderKey: string | null;
  /** Present for items that can be expanded or collapsed. */
  expanded?: boolean;
}

export type GraphTreeItem =
  | (GraphTreeItemBase & { type: 'row'; row: GraphTreeRow })
  | (GraphTreeItemBase & { type: 'folder'; folder: GraphTreeFolderKind; label: string; count: number });

interface FolderNode {
  key: string;
  folder: GraphTreeFolderKind;
  label: string;
  children: TreeNode[];
}

type TreeNode = { row: GraphTreeRow; children: TreeNode[]; folderKey: string | null } | FolderNode;

function isFolder(node: TreeNode): node is FolderNode {
  return 'folder' in node;
}

const FOLDER_FOR_GROUP: Record<Exclude<GraphTreeGroup['kind'], 'group' | 'input'>, GraphTreeFolderKind> = {
  mask: 'mask',
  pattern: 'pattern',
};

function rowChildren(row: GraphTreeRow): { children: TreeNode[]; folderKey: string | null } {
  const merge = row.groups.find((group) => group.kind === 'group');
  const inputs = row.groups.filter((group) => group.kind === 'input');
  const nested: TreeNode[] = [];
  for (const group of row.groups) {
    if (group.kind === 'group' || group.kind === 'input') continue;
    nested.push({
      key: group.key,
      folder: FOLDER_FOR_GROUP[group.kind],
      label: group.label,
      children: toTreeNodes(group.rows),
    });
  }
  if (inputs.length > 0) {
    nested.push({
      key: `${row.nodeId}:inputs`,
      folder: 'inputs',
      label: 'Inputs',
      children: inputs.map((group) => ({
        key: group.key,
        folder: 'input' as const,
        label: group.label,
        children: toTreeNodes(group.rows),
      })),
    });
  }
  // A merge row is itself the folder: its `b` stack sits directly under it.
  const children = merge ? [...toTreeNodes(merge.rows), ...nested] : nested;
  return { children, folderKey: merge?.key ?? (children.length > 0 ? `${row.nodeId}:row` : null) };
}

function toTreeNodes(rows: GraphTreeRow[]): TreeNode[] {
  return rows.map((row) => ({ row, ...rowChildren(row) }));
}

function rootNodes(tree: GraphLayerTree): TreeNode[] {
  const roots = toTreeNodes(tree.output);
  if (tree.notInOutput.length === 0) return roots;
  return [
    ...roots,
    {
      key: NOT_IN_OUTPUT_KEY,
      folder: 'notInOutput',
      label: 'Not in output',
      children: tree.notInOutput.flatMap((stack) => toTreeNodes(stack)),
    },
  ];
}

function nodeFolderKey(node: TreeNode) {
  return isFolder(node) ? node.key : node.folderKey;
}

function nodeKey(node: TreeNode) {
  return isFolder(node) ? node.key : node.row.key;
}

function countRows(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => total + (isFolder(node) ? countRows(node.children) : 1), 0);
}

/**
 * Narrow screens start with nested folders and "Not in output" collapsed so deep graphs stay
 * scannable; wide screens start fully expanded.
 */
export function defaultFolderCollapsed(key: string, level: number, narrow: boolean): boolean {
  if (!narrow) return false;
  return key === NOT_IN_OUTPUT_KEY || level > 1;
}

export function isFolderCollapsed(collapse: GraphTreeCollapseState, key: string, level: number, narrow: boolean) {
  return collapse.get(key) ?? defaultFolderCollapsed(key, level, narrow);
}

/** Visible tree items in display order. */
export function visibleGraphTreeItems(
  tree: GraphLayerTree,
  collapse: GraphTreeCollapseState,
  narrow: boolean,
): GraphTreeItem[] {
  const items: GraphTreeItem[] = [];
  const visit = (nodes: TreeNode[], level: number, parentKey: string | null) => {
    nodes.forEach((node, index) => {
      const folderKey = nodeFolderKey(node);
      const expanded = folderKey ? !isFolderCollapsed(collapse, folderKey, level, narrow) : undefined;
      const base = {
        key: nodeKey(node),
        level,
        setSize: nodes.length,
        posInSet: index + 1,
        parentKey,
        folderKey,
        expanded,
      };
      if (isFolder(node)) {
        items.push({
          ...base,
          type: 'folder',
          folder: node.folder,
          label: node.label,
          count: countRows(node.children),
        });
      } else {
        items.push({ ...base, type: 'row', row: node.row });
      }
      if (expanded) visit(node.children, level + 1, base.key);
    });
  };
  visit(rootNodes(tree), 1, null);
  return items;
}

/** For every full entry, the folder keys that must be expanded to show it. */
export function graphTreeAncestorFolders(tree: GraphLayerTree): Map<string, string[]> {
  const ancestors = new Map<string, string[]>();
  const visit = (nodes: TreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (!isFolder(node) && !node.row.reference) ancestors.set(node.row.nodeId, path);
      const folderKey = nodeFolderKey(node);
      visit(node.children, folderKey ? [...path, folderKey] : path);
    }
  };
  visit(rootNodes(tree), []);
  return ancestors;
}

/** Layer ids in tree display order, for range selection. */
export function graphTreeLayerOrder(tree: GraphLayerTree, isLayer: (nodeId: string) => boolean): string[] {
  const order: string[] = [];
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (!isFolder(node) && !node.row.reference && isLayer(node.row.nodeId)) order.push(node.row.nodeId);
      visit(node.children);
    }
  };
  visit(rootNodes(tree));
  return order;
}
