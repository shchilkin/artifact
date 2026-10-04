import {
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CanvasDocument, GraphArea, GraphMergeNode, Layer } from '../../types/config';
import type { GraphLayerTree, GraphTreeNodeKind, GraphTreeRow } from '../../utils/graphLayerTree';
import {
  EditorRowFrame,
  EditorRowLeading,
  EditorRowMetadata,
  EditorRowPrimary,
} from '../editor-workflow/EditorRowFrame';
import {
  type GraphTreeCollapseState,
  type GraphTreeItem,
  graphTreeAncestorFolders,
  visibleGraphTreeItems,
} from './graphTreeItems';
import { LayerRow, type LayerRowProps, LayerTreeCaret } from './LayerRow';
import { GRAPH_HELPER_META } from './layerDisplayItems';
import { type LayerRowTreePlacement, layerKindLabel, layerTreeItemProps } from './layerRowTree';

// Read-only graph-derived Layers tree for custom graphs (docs/layers-graph-tree.md).
// Rows form one flat ARIA tree with roving focus; collapse state is UI state keyed by node id.

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
  onStartEditing: (id: string) => void;
  onFinishRename: LayerRowProps['onFinishRename'];
  onToggleVisible: LayerRowProps['onToggleVisible'];
  onDuplicateLayer: LayerRowProps['onDuplicateLayer'];
  onRemoveLayer: LayerRowProps['onRemoveLayer'];
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

function TreeAreaChip({ areas }: { areas: GraphArea[] }) {
  if (areas.length === 0) return null;
  const names = areas.map((area) => area.name).join(', ');
  return (
    <span className="layer-area-chip" title={names} aria-label={`Graph area: ${names}`}>
      <span className="layer-area-dot" style={{ background: areas[0].color }} aria-hidden="true" />
      <span className="layer-area-name">{areas[0].name}</span>
      {areas.length > 1 && <span className="layer-area-more">+{areas.length - 1}</span>}
    </span>
  );
}

function GraphNodeTreeRow({
  row,
  placement,
  selected,
  areas,
  merge,
  onSelectNode,
}: {
  row: GraphTreeRow;
  placement: LayerRowTreePlacement;
  selected: boolean;
  areas: GraphArea[];
  merge: GraphMergeNode | undefined;
  onSelectNode: (id: string) => void;
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
        <TreeAreaChip areas={areas} />
      </EditorRowMetadata>
    </EditorRowFrame>
  );
}

function ReferenceTreeRow({
  row,
  placement,
  areas,
  onActivate,
}: {
  row: GraphTreeRow;
  placement: LayerRowTreePlacement;
  areas: GraphArea[];
  onActivate: (nodeId: string) => void;
}) {
  return (
    <EditorRowFrame
      {...layerTreeItemProps(placement, false, areas[0]?.color)}
      data-reference-node-id={row.nodeId}
      title={`Shared — go to ${row.name}`}
      className="layer-row layer-row-tree layer-tree-reference-row px-3 cursor-pointer border-b border-border select-none"
      onClick={() => onActivate(row.nodeId)}
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

function openRowContextMenu(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + Math.min(rect.width / 2, 160),
      clientY: rect.top + rect.height / 2,
    }),
  );
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
  onStartEditing,
  onFinishRename,
  onToggleVisible,
  onDuplicateLayer,
  onRemoveLayer,
}: GraphLayerTreeViewProps) {
  const narrow = useNarrowLayout();
  const [collapse, setCollapse] = useState<GraphTreeCollapseState>(() => new Map());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);

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
    const key = pendingFocusRef.current;
    if (!key) return;
    const element = treeItemElement(containerRef.current, key);
    if (!element) return;
    pendingFocusRef.current = null;
    element.focus();
    element.scrollIntoView?.({ block: 'nearest' });
  });

  const focusItem = useCallback((key: string) => {
    pendingFocusRef.current = key;
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

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.getAttribute('role') !== 'treeitem') return;
      const index = items.findIndex((item) => item.key === target.dataset.treeKey);
      const item = items[index];
      if (!item) return;

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
      if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && isLayerRow) {
        event.preventDefault();
        openRowContextMenu(target);
      }
    },
    [activateItem, focusItem, items, layersById, onStartEditing, toggleFolder],
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
        const rowPlacement = { ...placement, label: rowAccessibleLabel(row, layer, merge) };
        if (row.reference) {
          return (
            <ReferenceTreeRow
              key={item.key}
              row={row}
              placement={rowPlacement}
              areas={areas}
              onActivate={activateReference}
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
              dragOverPosition={null}
              editing={editingId === layer.id}
              reorderDisabled
              tree={rowPlacement}
              onSelect={onSelectLayer}
              onOpenContextMenu={onOpenLayerContextMenu}
              onStartEditing={onStartEditing}
              onFinishRename={handleFinishRename}
              onDragStart={noop}
              onDragOverLayer={noop}
              onDropLayer={noop}
              onDragEnd={noop}
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
          />
        );
      })}
    </div>
  );
}

function noop() {}
