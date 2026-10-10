import {
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CanvasDocument, GraphArea, GraphMergeNode, Layer } from '../../types/config';
import {
  buildGraphLayerTree,
  type GraphLayerTree,
  type GraphTreeNodeKind,
  type GraphTreeRow,
} from '../../utils/graphLayerTree';
import { checkTreeDrop, checkTreeRowMovable, type TreeDropPosition } from '../../utils/graphTreeEdits';
import {
  EditorRowActions,
  EditorRowFrame,
  EditorRowLeading,
  EditorRowMetadata,
  EditorRowPrimary,
} from '../editor-workflow/EditorRowFrame';
import { GraphLayerTreeEditingContext } from './graphLayerTreeEditing';
import {
  type GraphTreeCollapseState,
  type GraphTreeItem,
  graphTreeAncestorFolders,
  visibleGraphTreeItems,
} from './graphTreeItems';
import { LayerAreaChip, LayerRow, type LayerRowProps, LayerTreeCaret, RowActionsButton } from './LayerRow';
import { GRAPH_HELPER_META } from './layerDisplayItems';
import {
  isPointerInLowerHalf,
  type LayerRowTreeDrag,
  type LayerRowTreePlacement,
  layerKindLabel,
  layerTreeItemProps,
} from './layerRowTree';

// Graph-derived Layers tree for custom graphs (docs/layers-graph-tree.md).
// Rows form one flat ARIA tree with roving focus; collapse state is UI state keyed by node id.
// Inside `GraphLayerTreeEditingContext`, rows move by drag and drop, Alt+Arrow keys, or a keyboard move mode, and delete with Delete.

const NARROW_QUERY = '(max-width: 767px)';

const NODE_META: Record<Exclude<GraphTreeNodeKind, 'layer'>, { icon: string; label: string }> = {
  merge: GRAPH_HELPER_META.merge,
  color: GRAPH_HELPER_META.color,
  repeat: GRAPH_HELPER_META.repeat,
  material: GRAPH_HELPER_META.material,
  mask: GRAPH_HELPER_META.mask,
  transform: GRAPH_HELPER_META.transform,
  grimeShadow: GRAPH_HELPER_META.grimeShadow,
  environment: GRAPH_HELPER_META.environment,
  shader: GRAPH_HELPER_META.shader,
  scene3d: { icon: '◌', label: '3d scene' },
};

export interface GraphLayerTreeViewProps {
  doc: CanvasDocument;
  tree: GraphLayerTree;
  selectedLayerId: string | null;
  selectedActionLayerIds: string[];
  editingId: string | null;
  onSelectLayer: LayerRowProps['onSelect'];
  /** Selects a graph-only node, or the full entry of a reference row. */
  onSelectNode: (id: string) => void;
  onOpenLayerContextMenu: LayerRowProps['onOpenContextMenu'];
  /** Opens layer actions from the keyboard, anchored to the row. */
  onOpenLayerContextMenuAt: (id: string, position: { x: number; y: number }, returnFocusTarget: HTMLElement) => void;
  onStartEditing: (id: string) => void;
  onFinishRename: LayerRowProps['onFinishRename'];
  onToggleVisible: LayerRowProps['onToggleVisible'];
  onDuplicateLayer: LayerRowProps['onDuplicateLayer'];
  onRemoveLayer: LayerRowProps['onRemoveLayer'];
}

interface TreeDragState {
  nodeId: string;
  target: { key: string; position: TreeDropPosition } | null;
  /** Why the row under the pointer refuses the drop; announced once per change. */
  blockedReason: string | null;
}

function sameDragState(a: TreeDragState | null, b: TreeDragState) {
  return (
    a?.nodeId === b.nodeId &&
    a.target?.key === b.target?.key &&
    a.target?.position === b.target?.position &&
    a.blockedReason === b.blockedReason
  );
}

function useNarrowLayout() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY);
    if (!query) return;
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

function nodeAreaMap(areas: GraphArea[] | undefined) {
  const map = new Map<string, GraphArea[]>();
  for (const area of areas ?? []) {
    for (const nodeId of area.nodeIds) map.set(nodeId, [...(map.get(nodeId) ?? []), area]);
  }
  return map;
}

function blendLabel(blendMode: string) {
  return blendMode === 'source-over' ? 'normal' : blendMode;
}

function mergeSummary(merge: GraphMergeNode | undefined) {
  return merge ? `${blendLabel(merge.blendMode)} · ${Math.round(merge.opacity)}%` : null;
}

function rowKindLabel(row: GraphTreeRow, layer: Layer | undefined) {
  if (row.kind === 'layer') return layer ? `${layerKindLabel(layer)} layer` : 'layer';
  return row.kind === 'merge' ? 'merge group' : NODE_META[row.kind].label;
}

function rowAccessibleLabel(row: GraphTreeRow, layer: Layer | undefined, merge: GraphMergeNode | undefined) {
  if (row.reference) return `${row.name}, shared ${rowKindLabel(row, layer)}, go to its full entry`;
  const parts = [row.name, rowKindLabel(row, layer)];
  const summary = mergeSummary(merge);
  if (summary) parts.push(summary);
  if (layer && !layer.visible) parts.push('hidden');
  if (layer?.locked) parts.push('locked');
  return parts.join(', ');
}

function folderAccessibleLabel(label: string, count: number) {
  return `${label}, ${count} ${count === 1 ? 'item' : 'items'}`;
}

function GraphNodeTreeRow({
  row,
  placement,
  selected,
  areas,
  merge,
  onSelectNode,
  onContextMenu,
}: {
  row: GraphTreeRow;
  placement: LayerRowTreePlacement;
  selected: boolean;
  areas: GraphArea[];
  merge: GraphMergeNode | undefined;
  onSelectNode: (id: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const meta = row.kind === 'layer' ? null : NODE_META[row.kind];
  const summary = mergeSummary(merge);
  return (
    <EditorRowFrame
      {...layerTreeItemProps(placement, selected, areas[0]?.color)}
      selected={selected}
      data-node-id={row.nodeId}
      data-tree-node-kind={row.kind}
      className={`layer-row layer-row-tree layer-tree-node-row px-3 cursor-pointer border-b border-border select-none ${
        selected ? 'layer-row-selected' : ''
      }`}
      onClick={() => onSelectNode(row.nodeId)}
      onContextMenu={onContextMenu}
    >
      <EditorRowLeading>
        <LayerTreeCaret expanded={placement.expanded} onToggle={placement.onToggleExpanded} />
        <span className="layer-tree-node-icon" aria-hidden="true">
          {meta?.icon}
        </span>
      </EditorRowLeading>
      <EditorRowPrimary>
        <span className={`layer-row-name ${selected ? 'text-text' : 'text-dim'}`}>{row.name}</span>
      </EditorRowPrimary>
      <EditorRowMetadata className="layer-row-meta">
        {summary ? <span className="layer-tree-merge-summary">{summary}</span> : null}
        <span className="layer-tree-node-kind">{row.kind === 'merge' ? 'group' : meta?.label}</span>
        <LayerAreaChip areas={areas} />
      </EditorRowMetadata>
      {onContextMenu ? (
        <EditorRowActions>
          <RowActionsButton label={`Open actions for ${row.name}`} inTree onOpen={onContextMenu} />
        </EditorRowActions>
      ) : null}
    </EditorRowFrame>
  );
}

function ReferenceTreeRow({
  row,
  placement,
  areas,
  onActivate,
  onContextMenu,
}: {
  row: GraphTreeRow;
  placement: LayerRowTreePlacement;
  areas: GraphArea[];
  onActivate: (nodeId: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  return (
    <EditorRowFrame
      {...layerTreeItemProps(placement, false, areas[0]?.color)}
      data-reference-node-id={row.nodeId}
      title={`Shared — go to ${row.name}`}
      className="layer-row layer-row-tree layer-tree-reference-row px-3 cursor-pointer border-b border-border select-none"
      onClick={() => onActivate(row.nodeId)}
      onContextMenu={onContextMenu}
    >
      <EditorRowLeading>
        <LayerTreeCaret />
        <span className="layer-tree-node-icon" aria-hidden="true">
          ↪
        </span>
      </EditorRowLeading>
      <EditorRowPrimary>
        <span className="layer-row-name text-dim">{row.name}</span>
      </EditorRowPrimary>
      <EditorRowMetadata className="layer-row-meta">
        <span className="layer-tree-node-kind">shared</span>
      </EditorRowMetadata>
      {onContextMenu ? (
        <EditorRowActions>
          <RowActionsButton label={`Open actions for shared ${row.name}`} inTree onOpen={onContextMenu} />
        </EditorRowActions>
      ) : null}
    </EditorRowFrame>
  );
}

function FolderTreeRow({
  item,
  placement,
}: {
  item: Extract<GraphTreeItem, { type: 'folder' }>;
  placement: LayerRowTreePlacement;
}) {
  return (
    <div
      {...layerTreeItemProps(placement, false)}
      data-tree-folder={item.folder}
      className="layer-tree-folder-row"
      onClick={placement.onToggleExpanded}
    >
      <LayerTreeCaret expanded={placement.expanded} onToggle={placement.onToggleExpanded} />
      <span className="layer-tree-folder-label">{item.label}</span>
      <span className="layer-tree-folder-count" aria-hidden="true">
        {item.count}
      </span>
    </div>
  );
}

function treeItemElement(container: HTMLElement | null, key: string) {
  return container?.querySelector<HTMLElement>(`[role="treeitem"][data-tree-key="${CSS.escape(key)}"]`) ?? null;
}

function nextFocusKey(items: GraphTreeItem[], index: number, key: string): string | null {
  switch (key) {
    case 'ArrowDown':
      return items[Math.min(index + 1, items.length - 1)]?.key ?? null;
    case 'ArrowUp':
      return items[Math.max(index - 1, 0)]?.key ?? null;
    case 'Home':
      return items[0]?.key ?? null;
    case 'End':
      return items.at(-1)?.key ?? null;
    default:
      return null;
  }
}

function rowMenuPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + Math.min(rect.width / 2, 160), y: rect.top + rect.height / 2 };
}

function itemLabel(item: GraphTreeItem) {
  return item.type === 'folder' ? item.label : item.row.name;
}

/** Type-ahead: the next visible item after `index` whose name starts with `character`, wrapping around. */
function typeAheadKey(items: GraphTreeItem[], index: number, character: string): string | null {
  const needle = character.toLocaleLowerCase();
  for (let offset = 1; offset <= items.length; offset += 1) {
    const candidate = items[(index + offset) % items.length];
    if (itemLabel(candidate).toLocaleLowerCase().startsWith(needle)) return candidate.key;
  }
  return null;
}

function isTypeAheadKey(event: ReactKeyboardEvent) {
  return event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function pointerDropPosition(event: ReactDragEvent<HTMLElement>): TreeDropPosition {
  return isPointerInLowerHalf(event) ? 'below' : 'above';
}

/**
 * What a pointer position on a row means. The lower half of an open merge folder is the top of its
 * group, which is the row drawn right under it; everywhere else it is the gap below the row.
 */
function dropTargetFor(item: GraphTreeItem, row: GraphTreeRow, pointer: TreeDropPosition) {
  const group = row.groups.find((candidate) => candidate.kind === 'group');
  const first = group?.rows[0];
  if (pointer === 'below' && item.expanded && first) return { target: first, position: 'above' as const };
  return { target: row, position: pointer };
}

function isTextEntry(element: HTMLElement) {
  return element.isContentEditable || element.matches('input, textarea, select');
}

/** The ids a Delete key press acts on: the selection when the row is part of it, else the row. */
function deleteIds(nodeId: string, selectedIds: string[]) {
  return selectedIds.includes(nodeId) ? selectedIds : [nodeId];
}

export function GraphLayerTreeView({
  doc,
  tree,
  selectedLayerId,
  selectedActionLayerIds,
  editingId,
  onSelectLayer,
  onSelectNode,
  onOpenLayerContextMenu,
  onOpenLayerContextMenuAt,
  onStartEditing,
  onFinishRename,
  onToggleVisible,
  onDuplicateLayer,
  onRemoveLayer,
}: GraphLayerTreeViewProps) {
  const editing = useContext(GraphLayerTreeEditingContext);
  const narrow = useNarrowLayout();
  const [collapse, setCollapse] = useState<GraphTreeCollapseState>(() => new Map());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<TreeDragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Focus requests are state, so handlers stay ref-free; the effect remembers which one it served.
  const [focusRequest, setFocusRequest] = useState<{ key: string; serial: number } | null>(null);
  const servedFocusRef = useRef(0);

  const items = useMemo(() => visibleGraphTreeItems(tree, collapse, narrow), [collapse, narrow, tree]);
  const ancestors = useMemo(() => graphTreeAncestorFolders(tree), [tree]);
  const layersById = useMemo(() => new Map(doc.layers.map((layer) => [layer.id, layer])), [doc.layers]);
  const mergesById = useMemo(
    () => new Map((doc.graph?.mergeNodes ?? []).map((node) => [node.id, node])),
    [doc.graph?.mergeNodes],
  );
  const areasByNodeId = useMemo(() => nodeAreaMap(doc.graph?.areas), [doc.graph?.areas]);

  const activeKey = useMemo(() => {
    if (focusKey && items.some((item) => item.key === focusKey)) return focusKey;
    const selected = items.find((item) => item.type === 'row' && !item.row.reference && item.key === selectedLayerId);
    return selected?.key ?? items[0]?.key ?? null;
  }, [focusKey, items, selectedLayerId]);

  useLayoutEffect(() => {
    if (!focusRequest || servedFocusRef.current === focusRequest.serial) return;
    const element = treeItemElement(containerRef.current, focusRequest.key);
    if (!element) return;
    servedFocusRef.current = focusRequest.serial;
    element.focus();
    element.scrollIntoView?.({ block: 'nearest' });
  });

  const focusItem = useCallback((key: string) => {
    setFocusRequest((previous) => ({ key, serial: (previous?.serial ?? 0) + 1 }));
    setFocusKey(key);
  }, []);

  const setFolderCollapsed = useCallback(
    (key: string, collapsed: boolean) =>
      setCollapse((previous) => {
        const next = new Map(previous);
        next.set(key, collapsed);
        return next;
      }),
    [],
  );

  const toggleFolder = useCallback(
    (item: GraphTreeItem) => {
      if (!item.folderKey) return;
      setFolderCollapsed(item.folderKey, Boolean(item.expanded));
    },
    [setFolderCollapsed],
  );

  /** Focuses a moved row in the edited document's tree, opening the folders around it. */
  const revealAfterEdit = useCallback(
    (nodeId: string, edited: CanvasDocument | null) => {
      if (!edited) return;
      const folders = graphTreeAncestorFolders(buildGraphLayerTree(edited)).get(nodeId) ?? [];
      if (folders.length > 0) {
        setCollapse((previous) => {
          const next = new Map(previous);
          for (const folderKey of folders) next.set(folderKey, false);
          return next;
        });
      }
      focusItem(nodeId);
    },
    [focusItem],
  );

  const activateReference = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId);
      setCollapse((previous) => {
        const next = new Map(previous);
        for (const folderKey of ancestors.get(nodeId) ?? []) next.set(folderKey, false);
        return next;
      });
      focusItem(nodeId);
    },
    [ancestors, focusItem, onSelectNode],
  );

  const activateItem = useCallback(
    (item: GraphTreeItem, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      if (item.type === 'folder') return toggleFolder(item);
      if (item.row.reference) return activateReference(item.row.nodeId);
      if (layersById.has(item.row.nodeId)) return onSelectLayer(item.row.nodeId, modifiers);
      onSelectNode(item.row.nodeId);
    },
    [activateReference, layersById, onSelectLayer, onSelectNode, toggleFolder],
  );

  /** Tree edit keys. Returns true when the key was handled. */
  const handleEditKey = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, item: GraphTreeItem): boolean => {
      if (!editing || item.type !== 'row') return false;
      const { row } = item;
      const moving = editing.movingNodeId;
      if (moving && event.key === 'Escape') {
        event.preventDefault();
        editing.actions.cancelMove();
        return true;
      }
      if (moving && event.key === 'Enter') {
        event.preventDefault();
        const position = event.shiftKey ? 'below' : 'above';
        const check = checkTreeDrop(editing.index, moving, row, position);
        if (!check.ok) editing.actions.announceBlocked(check.reason);
        else revealAfterEdit(moving, editing.actions.move(moving, row.nodeId, position));
        return true;
      }
      if (row.reference) return false;
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const direction = event.key === 'ArrowUp' ? 'up' : 'down';
        revealAfterEdit(row.nodeId, editing.actions.step(row.nodeId, direction));
        return true;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        editing.actions.deleteRows(deleteIds(row.nodeId, selectedActionLayerIds));
        return true;
      }
      return false;
    },
    [editing, revealAfterEdit, selectedActionLayerIds],
  );

  const clearDrag = useCallback(() => setDrag(null), []);

  const updateDrag = useCallback(
    (next: TreeDragState) => setDrag((current) => (sameDragState(current, next) ? current : next)),
    [],
  );

  const rowItemFor = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      const key = event.currentTarget.dataset.treeKey;
      const item = items.find((candidate) => candidate.key === key);
      return item?.type === 'row' ? item : null;
    },
    [items],
  );

  const handleRowDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      event.stopPropagation();
      const item = rowItemFor(event);
      const movable = Boolean(
        editing && item && !item.row.reference && checkTreeRowMovable(editing.index, item.row.nodeId).ok,
      );
      if (!item || !movable) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.row.nodeId);
      updateDrag({ nodeId: item.row.nodeId, target: null, blockedReason: null });
    },
    [editing, rowItemFor, updateDrag],
  );

  const handleRowDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      const item = rowItemFor(event);
      if (!editing || !drag || !item) return;
      const pointer = pointerDropPosition(event);
      const { target, position } = dropTargetFor(item, item.row, pointer);
      const check = checkTreeDrop(editing.index, drag.nodeId, target, position);
      if (!check.ok) {
        event.dataTransfer.dropEffect = 'none';
        if (drag.blockedReason !== check.reason) editing.actions.announceBlocked(check.reason);
        updateDrag({ nodeId: drag.nodeId, target: null, blockedReason: check.reason });
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      updateDrag({ nodeId: drag.nodeId, target: { key: item.key, position: pointer }, blockedReason: null });
    },
    [drag, editing, rowItemFor, updateDrag],
  );

  const handleRowDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault();
      clearDrag();
      const item = rowItemFor(event);
      if (!editing || !drag || !item) return;
      const { target, position } = dropTargetFor(item, item.row, pointerDropPosition(event));
      const check = checkTreeDrop(editing.index, drag.nodeId, target, position);
      if (!check.ok) {
        editing.actions.announceBlocked(check.reason);
        return;
      }
      revealAfterEdit(drag.nodeId, editing.actions.move(drag.nodeId, target.nodeId, position));
    },
    [clearDrag, drag, editing, revealAfterEdit, rowItemFor],
  );

  /** Drag state for one row. The handlers are shared and find their row from `data-tree-key`. */
  const rowDrag = (item: GraphTreeItem & { type: 'row' }): LayerRowTreeDrag | undefined => {
    if (!editing) return undefined;
    const { row } = item;
    return {
      draggable: !row.reference && checkTreeRowMovable(editing.index, row.nodeId).ok,
      dragging: !row.reference && drag?.nodeId === row.nodeId,
      dropPosition: drag?.target?.key === item.key ? drag.target.position : null,
      onDragStart: handleRowDragStart,
      onDragOver: handleRowDragOver,
      onDrop: handleRowDrop,
      onDragEnd: clearDrag,
    };
  };

  const openNodeMenu = useCallback(
    (row: GraphTreeRow, event: ReactMouseEvent<HTMLElement>) => {
      if (!editing) return;
      event.preventDefault();
      const rowElement = event.currentTarget.closest<HTMLElement>('[role="treeitem"]') ?? event.currentTarget;
      editing.actions.openNodeMenu(row.nodeId, { x: event.clientX, y: event.clientY }, rowElement, row.reference);
    },
    [editing],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const origin = event.target as HTMLElement;
      // Text fields keep their own keys; any other control in a row (the name button after a click,
      // the actions button) acts for its row.
      if (isTextEntry(origin)) return;
      const target = origin.closest<HTMLElement>('[role="treeitem"]');
      if (!target) return;
      const index = items.findIndex((item) => item.key === target.dataset.treeKey);
      const item = items[index];
      if (!item) return;
      if (editing && handleEditKey(event, item)) return;
      // Enter and Space on a row control press that control.
      if (origin !== target && (event.key === 'Enter' || event.key === ' ')) return;

      const moveTo = nextFocusKey(items, index, event.key);
      if (moveTo) {
        event.preventDefault();
        focusItem(moveTo);
        return;
      }
      if (event.key === 'ArrowRight' && item.expanded !== undefined) {
        event.preventDefault();
        if (!item.expanded) toggleFolder(item);
        else if (items[index + 1]?.parentKey === item.key) focusItem(items[index + 1].key);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (item.expanded) toggleFolder(item);
        else if (item.parentKey) focusItem(item.parentKey);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateItem(item, event);
        return;
      }
      const isLayerRow = item.type === 'row' && !item.row.reference && layersById.has(item.row.nodeId);
      if (event.key === 'F2' && isLayerRow) {
        event.preventDefault();
        onStartEditing(item.row.nodeId);
        return;
      }
      const opensMenu = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
      if (opensMenu && isLayerRow) {
        event.preventDefault();
        onOpenLayerContextMenuAt(item.row.nodeId, rowMenuPosition(target), target);
        return;
      }
      if (opensMenu && editing && item.type === 'row') {
        event.preventDefault();
        editing.actions.openNodeMenu(item.row.nodeId, rowMenuPosition(target), target, item.row.reference);
        return;
      }
      if (isTypeAheadKey(event)) {
        const match = typeAheadKey(items, index, event.key);
        if (!match) return;
        event.preventDefault();
        focusItem(match);
      }
    },
    [
      activateItem,
      editing,
      focusItem,
      handleEditKey,
      items,
      layersById,
      onOpenLayerContextMenuAt,
      onStartEditing,
      toggleFolder,
    ],
  );

  const handleFinishRename = useCallback(
    (id: string, name: string | null) => {
      // Enter/Escape finish with focus still in the input, which then unmounts: keep focus on the row.
      // A blur finish means focus already moved elsewhere, so leave it there.
      const focusInTree = containerRef.current?.contains(document.activeElement) ?? false;
      onFinishRename(id, name);
      if (focusInTree) focusItem(id);
    },
    [focusItem, onFinishRename],
  );

  const handleFocus = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')?.dataset.treeKey;
    if (key) setFocusKey(key);
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: ARIA tree; no native element provides tree semantics.
    <div
      ref={containerRef}
      role="tree"
      aria-label="Layer tree"
      aria-multiselectable="true"
      aria-describedby={editing?.helpId}
      data-tree-moving={editing?.movingNodeId ? 'true' : undefined}
      className="layer-tree"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
    >
      {items.map((item) => {
        const placement: LayerRowTreePlacement = {
          key: item.key,
          level: item.level,
          setSize: item.setSize,
          posInSet: item.posInSet,
          focusable: item.key === activeKey,
          label: '',
          expanded: item.expanded,
          onToggleExpanded: item.folderKey ? () => toggleFolder(item) : undefined,
        };
        if (item.type === 'folder') {
          return (
            <FolderTreeRow
              key={item.key}
              item={item}
              placement={{ ...placement, label: folderAccessibleLabel(item.label, item.count) }}
            />
          );
        }
        const { row } = item;
        const layer = layersById.get(row.nodeId);
        const merge = mergesById.get(row.nodeId);
        const areas = areasByNodeId.get(row.nodeId) ?? [];
        const rowPlacement: LayerRowTreePlacement = {
          ...placement,
          label: rowAccessibleLabel(row, layer, merge),
          drag: rowDrag(item),
        };
        if (editing?.movingNodeId === row.nodeId && !row.reference) {
          rowPlacement.moving = true;
          rowPlacement.label = `${rowPlacement.label}, moving`;
        }
        if (row.reference) {
          return (
            <ReferenceTreeRow
              key={item.key}
              row={row}
              placement={rowPlacement}
              areas={areas}
              onActivate={activateReference}
              onContextMenu={editing ? (event) => openNodeMenu(row, event) : undefined}
            />
          );
        }
        if (layer) {
          return (
            <LayerRow
              key={item.key}
              layer={layer}
              areas={areas}
              selected={selectedActionLayerIds.includes(layer.id)}
              editing={editingId === layer.id}
              reachesOutput={tree.reachedNodeIds.has(layer.id)}
              reorderDisabled={!rowPlacement.drag?.draggable}
              tree={rowPlacement}
              onSelect={onSelectLayer}
              onOpenContextMenu={onOpenLayerContextMenu}
              onStartEditing={onStartEditing}
              onFinishRename={handleFinishRename}
              onToggleVisible={onToggleVisible}
              onDuplicateLayer={onDuplicateLayer}
              onRemoveLayer={onRemoveLayer}
            />
          );
        }
        return (
          <GraphNodeTreeRow
            key={item.key}
            row={row}
            placement={rowPlacement}
            selected={selectedLayerId === row.nodeId}
            areas={areas}
            merge={merge}
            onSelectNode={onSelectNode}
            onContextMenu={editing ? (event) => openNodeMenu(row, event) : undefined}
          />
        );
      })}
    </div>
  );
}
