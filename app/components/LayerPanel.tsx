import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CanvasDocument,
  CanvasGraph,
  EffectLayer,
  EffectPreset,
  GraphArea,
  Layer,
  LayerKind,
} from '../types/config';
import { EFFECT_PRESET_MENU_ORDER, EFFECT_PRESETS } from '../types/config';
import { getLayerAreaMap } from '../utils/layerAreas';
import { EXPORT_NODE_ID } from '../utils/nodeGraph';

interface Props {
  doc: CanvasDocument;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onRemoveLayer: (id: string) => void;
  onReorderLayers: (newOrder: Layer[], areaSeparation?: { areaId: string; ids: string[] }) => void;
  onToggleVisible: (id: string) => void;
  onSetLayersVisible: (ids: string[], visible: boolean) => void;
  onCreateAreaFromLayers: (ids: string[]) => void;
  onAddLayersToArea: (areaId: string, ids: string[]) => void;
  onRemoveLayersFromAreas: (ids: string[]) => void;
  onRemoveNodesFromArea: (areaId: string, ids: string[]) => void;
  onRemoveArea: (areaId: string) => void;
  onRenameArea: (areaId: string, name: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  modeSwitcher?: React.ReactNode;
}

const KIND_ICONS: Record<LayerKind, string> = {
  text: 'T',
  image: '◻',
  emoji: '✦',
  effect: '⚡',
  fill: '■',
  primitive: '◍',
  noise: '░',
  array: '▦',
};

interface LayerRowProps {
  layer: Layer;
  areas: GraphArea[];
  selected: boolean;
  dragOver: boolean;
  editing: boolean;
  nested?: boolean;
  onSelect: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onOpenContextMenu: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartEditing: (id: string) => void;
  onFinishRename: (id: string, name: string | null) => void;
  onDragStart: (id: string) => void;
  onDragOverLayer: (id: string) => void;
  onDropLayer: (id: string) => void;
  onDragEnd: () => void;
  onToggleVisible: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onRemoveLayer: (id: string) => void;
}

const LayerRow = memo(function LayerRow({
  layer,
  areas,
  selected,
  dragOver,
  editing,
  nested = false,
  onSelect,
  onOpenContextMenu,
  onStartEditing,
  onFinishRename,
  onDragStart,
  onDragOverLayer,
  onDropLayer,
  onDragEnd,
  onToggleVisible,
  onDuplicateLayer,
  onRemoveLayer,
}: LayerRowProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(layer.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverLayer(layer.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropLayer(layer.id);
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => onSelect(layer.id, event)}
      onContextMenu={(event) => onOpenContextMenu(layer.id, event)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEditing(layer.id);
      }}
      className={`layer-row flex items-center gap-2 px-3 min-h-[36px] cursor-pointer border-b border-border select-none transition-colors ${
        selected ? 'bg-accent-dim' : 'hover:bg-accent-dim/50'
      } ${dragOver ? 'border-t-2 border-t-accent' : ''} ${nested ? 'layer-row-nested' : ''}`}
    >
      <span className="text-dim text-[10px] cursor-grab active:cursor-grabbing flex-shrink-0">⠿</span>
      <span
        className={`font-mono text-[10px] flex-shrink-0 w-5 text-center ${layer.kind === 'effect' ? 'text-accent' : 'text-dim'}`}
        style={{ fontWeight: 700 }}
      >
        {layer.kind === 'effect'
          ? (EFFECT_PRESETS[(layer as EffectLayer).preset!]?.icon ?? '⚡')
          : KIND_ICONS[layer.kind]}
      </span>
      {editing ? (
        <input
          autoFocus
          defaultValue={layer.name}
          className="font-mono text-[10px] flex-1 min-w-0 bg-transparent border-none outline-none border-b border-accent text-text"
          onBlur={(e) => {
            const value = e.target.value.trim();
            onFinishRename(layer.id, value || null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = e.currentTarget.value.trim();
              onFinishRename(layer.id, value || null);
            } else if (e.key === 'Escape') {
              onFinishRename(layer.id, null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`font-mono text-[10px] flex-1 truncate min-w-0 ${selected ? 'text-text' : 'text-dim'}`}>
          {layer.name}
        </span>
      )}
      {areas.length > 0 && !nested && (
        <span
          className="layer-area-chip"
          title={areas.map((area) => area.name).join(', ')}
          aria-label={`Graph area: ${areas.map((area) => area.name).join(', ')}`}
        >
          <span className="layer-area-dot" style={{ background: areas[0].color }} aria-hidden="true" />
          <span className="layer-area-name">{areas[0].name}</span>
          {areas.length > 1 && <span className="layer-area-more">+{areas.length - 1}</span>}
        </span>
      )}
      <button
        className="text-[11px] flex-shrink-0 text-dim hover:text-text bg-transparent border-none cursor-pointer p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible(layer.id);
        }}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        title={layer.visible ? 'Hide' : 'Show'}
      >
        {layer.visible ? '◉' : '○'}
      </button>
      <button
        className="text-[11px] flex-shrink-0 text-dim hover:text-accent bg-transparent border-none cursor-pointer p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicateLayer(layer.id);
        }}
        aria-label="Duplicate layer"
        title="Duplicate"
      >
        ⊕
      </button>
      <button
        className="text-[11px] flex-shrink-0 text-dim hover:text-red-400 bg-transparent border-none cursor-pointer p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onRemoveLayer(layer.id);
        }}
        aria-label="Delete layer"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
});

type GraphHelperKind = 'merge' | 'color' | 'repeat' | 'export';

interface GraphHelperRowData {
  id: string;
  name: string;
  kind: GraphHelperKind;
  icon: string;
  label: string;
}

const GRAPH_HELPER_META: Record<GraphHelperKind, { icon: string; label: string }> = {
  merge: { icon: '◇', label: 'merge' },
  color: { icon: '◐', label: 'grade' },
  repeat: { icon: '▦', label: 'repeat' },
  export: { icon: '↗', label: 'output' },
};

const GraphHelperRow = memo(function GraphHelperRow({
  helper,
  areaId,
  onRemoveFromArea,
}: {
  helper: GraphHelperRowData;
  areaId: string;
  onRemoveFromArea: (areaId: string, ids: string[]) => void;
}) {
  return (
    <div
      className="layer-graph-helper-row"
      aria-label={`${helper.label} graph node: ${helper.name}`}
      title={`${helper.label} graph node`}
    >
      <span className="layer-graph-helper-grip" aria-hidden="true">
        ·
      </span>
      <span className="layer-graph-helper-icon" aria-hidden="true">
        {helper.icon}
      </span>
      <span className="layer-graph-helper-name">{helper.name}</span>
      <span className="layer-graph-helper-kind">{helper.label}</span>
      <button
        type="button"
        className="layer-graph-helper-remove"
        onClick={() => onRemoveFromArea(areaId, [helper.id])}
        aria-label={`Remove ${helper.name} from area`}
        title="Remove from area"
      >
        ×
      </button>
    </div>
  );
});

type LayerDisplayItem =
  | { type: 'layer'; layer: Layer; areas: GraphArea[]; nested?: false }
  | { type: 'area'; area: GraphArea; layers: Layer[]; graphHelpers: GraphHelperRowData[] };

function getAreaGraphHelpers(graph: CanvasGraph | undefined, area: GraphArea): GraphHelperRowData[] {
  if (!graph) return [];

  const areaNodeIds = new Set(area.nodeIds);
  const helpersById = new Map<string, GraphHelperRowData>();

  graph.mergeNodes.forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'merge', ...GRAPH_HELPER_META.merge });
  });
  (graph.colorNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'color', ...GRAPH_HELPER_META.color });
  });
  (graph.repeatNodes ?? []).forEach((node) => {
    if (!areaNodeIds.has(node.id)) return;
    helpersById.set(node.id, { id: node.id, name: node.name, kind: 'repeat', ...GRAPH_HELPER_META.repeat });
  });
  if (areaNodeIds.has(EXPORT_NODE_ID)) {
    helpersById.set(EXPORT_NODE_ID, {
      id: EXPORT_NODE_ID,
      name: 'Export',
      kind: 'export',
      ...GRAPH_HELPER_META.export,
    });
  }

  return area.nodeIds.flatMap((nodeId) => {
    const helper = helpersById.get(nodeId);
    return helper ? [helper] : [];
  });
}

function buildLayerDisplayItems(
  displayLayers: Layer[],
  areasByLayerId: Map<string, GraphArea[]>,
  graph: CanvasGraph | undefined,
): LayerDisplayItem[] {
  const items: LayerDisplayItem[] = [];
  const renderedAreaIds = new Set<string>();
  const renderedLayerIds = new Set<string>();

  for (const layer of displayLayers) {
    if (renderedLayerIds.has(layer.id)) continue;
    const area = areasByLayerId.get(layer.id)?.[0];
    if (!area) {
      items.push({ type: 'layer', layer, areas: [] });
      renderedLayerIds.add(layer.id);
      continue;
    }

    if (renderedAreaIds.has(area.id)) continue;
    const areaLayerIds = new Set(area.nodeIds);
    const areaLayers = displayLayers.filter((item) => areaLayerIds.has(item.id));
    for (const item of areaLayers) renderedLayerIds.add(item.id);
    renderedAreaIds.add(area.id);
    items.push({
      type: 'area',
      area,
      layers: areaLayers,
      graphHelpers: getAreaGraphHelpers(graph, area),
    });
  }

  return items;
}

export function LayerPanel({
  doc,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onAddEffectPreset,
  onRemoveLayer,
  onReorderLayers,
  onToggleVisible,
  onSetLayersVisible,
  onCreateAreaFromLayers,
  onAddLayersToArea,
  onRemoveLayersFromAreas,
  onRemoveNodesFromArea,
  onRemoveArea,
  onRenameArea,
  onDuplicateLayer,
  onRenameLayer,
  modeSwitcher,
}: Props) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<Set<string>>(() => new Set());
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => new Set());
  const [showAreaMenu, setShowAreaMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const dragLayerId = useRef<string | null>(null);
  const selectionAnchorId = useRef<string | null>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);
  const areaButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddMenu) return;
    function handleOutside(e: MouseEvent) {
      if (addButtonRef.current && !addButtonRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAddMenu]);

  useEffect(() => {
    if (!showAreaMenu) return;
    function handleOutside(e: MouseEvent) {
      if (areaButtonRef.current && !areaButtonRef.current.contains(e.target as Node)) {
        setShowAreaMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showAreaMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClose() {
      setContextMenu(null);
    }
    document.addEventListener('click', handleClose);
    document.addEventListener('scroll', handleClose, true);
    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('scroll', handleClose, true);
    };
  }, [contextMenu]);

  const displayLayers = useMemo(() => [...doc.layers].reverse(), [doc.layers]);
  const areasByLayerId = useMemo(() => getLayerAreaMap(doc.layers, doc.graph?.areas), [doc.layers, doc.graph?.areas]);
  const displayItems = useMemo(
    () => buildLayerDisplayItems(displayLayers, areasByLayerId, doc.graph),
    [areasByLayerId, displayLayers, doc.graph],
  );
  const activeCollapsedAreaIds = useMemo(() => {
    const areaIds = new Set((doc.graph?.areas ?? []).map((area) => area.id));
    return new Set([...collapsedAreaIds].filter((areaId) => areaIds.has(areaId)));
  }, [collapsedAreaIds, doc.graph?.areas]);
  const selectedActionLayerIds = useMemo(() => {
    const layerIds = new Set(doc.layers.map((layer) => layer.id));
    const validSelected = [...selectedLayerIds].filter((id) => layerIds.has(id));
    if (validSelected.length > 0) return validSelected;
    return selectedLayerId && layerIds.has(selectedLayerId) ? [selectedLayerId] : [];
  }, [doc.layers, selectedLayerId, selectedLayerIds]);
  const graphAreas = doc.graph?.areas ?? [];

  const handleDragStart = useCallback((id: string) => {
    dragLayerId.current = id;
  }, []);

  const handleDragOverLayer = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleSelectLayer = useCallback(
    (id: string, event: ReactMouseEvent<HTMLDivElement>) => {
      const orderedLayerIds = displayLayers.map((layer) => layer.id);
      const current = selectedLayerIds.size > 0 ? selectedLayerIds : new Set(selectedLayerId ? [selectedLayerId] : []);
      let next: Set<string>;

      if (event.shiftKey && selectionAnchorId.current) {
        const anchorIndex = orderedLayerIds.indexOf(selectionAnchorId.current);
        const targetIndex = orderedLayerIds.indexOf(id);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          next = new Set(orderedLayerIds.slice(start, end + 1));
        } else {
          next = new Set([id]);
        }
      } else if (event.metaKey || event.ctrlKey) {
        next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        selectionAnchorId.current = id;
      } else {
        next = new Set([id]);
        selectionAnchorId.current = id;
      }

      setSelectedLayerIds(next);
      onSelectLayer(next.has(id) ? id : ([...next].at(-1) ?? null));
    },
    [displayLayers, onSelectLayer, selectedLayerId, selectedLayerIds],
  );

  const handleOpenLayerContextMenu = useCallback(
    (id: string, event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const activeIds = selectedActionLayerIds.includes(id) ? selectedActionLayerIds : [id];
      setSelectedLayerIds(new Set(activeIds));
      onSelectLayer(id);
      setContextMenu({ x: event.clientX, y: event.clientY, ids: activeIds });
    },
    [onSelectLayer, selectedActionLayerIds],
  );

  const handleStartEditing = useCallback((id: string) => setEditingId(id), []);

  const handleFinishRename = useCallback(
    (id: string, name: string | null) => {
      if (name) onRenameLayer(id, name);
      setEditingId(null);
    },
    [onRenameLayer],
  );

  const handleFinishAreaRename = useCallback(
    (id: string, name: string | null) => {
      if (name) onRenameArea(id, name);
      setEditingAreaId(null);
    },
    [onRenameArea],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = dragLayerId.current;
      if (!sourceId || sourceId === targetId) {
        setDragOverId(null);
        dragLayerId.current = null;
        return;
      }

      const newDisplayLayers = [...displayLayers];
      const sourceIdx = newDisplayLayers.findIndex((layer) => layer.id === sourceId);
      const targetIdx = newDisplayLayers.findIndex((layer) => layer.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return;
      const sourceArea = areasByLayerId.get(sourceId)?.[0];
      const targetArea = areasByLayerId.get(targetId)?.[0];
      const [item] = newDisplayLayers.splice(sourceIdx, 1);
      newDisplayLayers.splice(targetIdx, 0, item);
      onReorderLayers(
        [...newDisplayLayers].reverse(),
        sourceArea && sourceArea.id !== targetArea?.id ? { areaId: sourceArea.id, ids: [sourceId] } : undefined,
      );
      setDragOverId(null);
      dragLayerId.current = null;
    },
    [areasByLayerId, displayLayers, onReorderLayers],
  );

  const handleAddLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      onAddLayer(kind);
      setShowAddMenu(false);
    },
    [onAddLayer],
  );

  const handleAddEffectPreset = useCallback(
    (key: EffectPreset) => {
      onAddEffectPreset(key);
      setShowAddMenu(false);
    },
    [onAddEffectPreset],
  );

  const handleToggleAddMenu = useCallback(() => {
    setShowAddMenu((prev) => !prev);
  }, []);

  const handleCancelDrag = useCallback(() => {
    setDragOverId(null);
    dragLayerId.current = null;
  }, []);

  const handleToggleAreaCollapsed = useCallback((areaId: string) => {
    setCollapsedAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }, []);

  const handleToggleAreaVisible = useCallback(
    (layers: Layer[], visible: boolean) => {
      const ids = layers.filter((layer) => layer.visible !== visible).map((layer) => layer.id);
      if (ids.length === 0) return;
      onSetLayersVisible(ids, visible);
    },
    [onSetLayersVisible],
  );

  const handleCreateAreaFromSelection = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      onCreateAreaFromLayers(ids);
      setShowAreaMenu(false);
      setContextMenu(null);
    },
    [onCreateAreaFromLayers],
  );

  const handleAddSelectionToArea = useCallback(
    (areaId: string, ids: string[]) => {
      if (ids.length === 0) return;
      onAddLayersToArea(areaId, ids);
      setShowAreaMenu(false);
      setContextMenu(null);
    },
    [onAddLayersToArea],
  );

  const handleRemoveSelectionFromAreas = useCallback(
    (ids: string[]) => {
      const removableIds = ids.filter((id) => areasByLayerId.has(id));
      if (removableIds.length === 0) return;
      onRemoveLayersFromAreas(removableIds);
      setShowAreaMenu(false);
      setContextMenu(null);
    },
    [areasByLayerId, onRemoveLayersFromAreas],
  );

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="layer-panel-header">
        {modeSwitcher ?? (
          <span className="font-mono text-[10px] tracking-[2.5px] uppercase font-semibold text-accent">LAYERS</span>
        )}
        <div ref={addButtonRef} className="relative">
          <button className="layer-add-button" onClick={handleToggleAddMenu} aria-label="Add layer">
            + ADD
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 bg-bg border border-border z-50 min-w-[130px]">
              {(
                ['text', 'image', 'emoji', 'fill', 'primitive', 'noise', 'array'] as Exclude<LayerKind, 'effect'>[]
              ).map((kind) => (
                <button
                  key={kind}
                  className="flex items-center gap-2 w-full px-3 py-2 font-mono text-[10px] text-left text-dim hover:text-accent hover:bg-accent-dim border-none bg-transparent cursor-pointer"
                  onClick={() => handleAddLayer(kind)}
                >
                  <span className="text-accent w-4 text-center">{KIND_ICONS[kind]}</span>
                  {kind.toUpperCase()}
                </button>
              ))}
              <div className="border-t border-border my-1" />
              {EFFECT_PRESET_MENU_ORDER.map((key) => {
                const preset = EFFECT_PRESETS[key];
                return (
                  <button
                    key={key}
                    className="flex items-center gap-2 w-full px-3 py-2 font-mono text-[10px] text-left text-dim hover:text-accent hover:bg-accent-dim border-none bg-transparent cursor-pointer"
                    onClick={() => handleAddEffectPreset(key)}
                  >
                    <span className="text-accent w-4 text-center">{preset.icon}</span>
                    {preset.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {displayLayers.length === 0 && (
          <div className="px-3.5 py-4 text-[10px] text-dim text-center font-mono">No layers. Add one above.</div>
        )}
        {selectedActionLayerIds.length > 1 && (
          <div className="layer-selection-actions">
            <span>{selectedActionLayerIds.length} selected</span>
            <button type="button" onClick={() => handleCreateAreaFromSelection(selectedActionLayerIds)}>
              Area
            </button>
            {graphAreas.length > 0 && (
              <div ref={areaButtonRef} className="relative">
                <button type="button" onClick={() => setShowAreaMenu((value) => !value)}>
                  Add
                </button>
                {showAreaMenu && (
                  <div className="layer-area-action-menu">
                    {graphAreas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => handleAddSelectionToArea(area.id, selectedActionLayerIds)}
                      >
                        <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
                        {area.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {displayItems.map((item) =>
          item.type === 'area' ? (
            <div key={item.area.id} className="layer-area-folder">
              <div
                className="layer-area-folder-header"
                title={`${item.layers.length} layer${item.layers.length === 1 ? '' : 's'}${
                  item.graphHelpers.length > 0
                    ? `, ${item.graphHelpers.length} graph node${item.graphHelpers.length === 1 ? '' : 's'}`
                    : ''
                }`}
              >
                <button
                  type="button"
                  className="layer-area-folder-toggle"
                  onClick={() => handleToggleAreaCollapsed(item.area.id)}
                  aria-expanded={!activeCollapsedAreaIds.has(item.area.id)}
                  aria-label={`${activeCollapsedAreaIds.has(item.area.id) ? 'Expand' : 'Collapse'} ${item.area.name}`}
                >
                  <span className="layer-area-caret" aria-hidden="true">
                    {activeCollapsedAreaIds.has(item.area.id) ? '+' : '-'}
                  </span>
                </button>
                <span className="layer-area-dot" style={{ background: item.area.color }} aria-hidden="true" />
                {editingAreaId === item.area.id ? (
                  <input
                    autoFocus
                    defaultValue={item.area.name}
                    className="layer-area-name-input"
                    aria-label={`Rename ${item.area.name}`}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      handleFinishAreaRename(item.area.id, value || null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        const value = event.currentTarget.value.trim();
                        handleFinishAreaRename(item.area.id, value || null);
                      } else if (event.key === 'Escape') {
                        handleFinishAreaRename(item.area.id, null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="layer-area-name-button"
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setEditingAreaId(item.area.id);
                    }}
                    title="Double-click to rename"
                  >
                    <span className="layer-area-name">{item.area.name}</span>
                  </button>
                )}
                <span className="layer-area-count">{item.layers.length}</span>
                {item.graphHelpers.length > 0 && (
                  <span className="layer-area-graph-count">+{item.graphHelpers.length}</span>
                )}
                <button
                  type="button"
                  className="layer-area-rename"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingAreaId(item.area.id);
                  }}
                  aria-label={`Rename ${item.area.name}`}
                  title="Rename area"
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="layer-area-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveArea(item.area.id);
                  }}
                  aria-label={`Ungroup ${item.area.name}`}
                  title="Ungroup area"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                className="layer-area-visibility"
                onClick={(event) => {
                  event.stopPropagation();
                  handleToggleAreaVisible(item.layers, !item.layers.some((layer) => layer.visible));
                }}
                disabled={item.layers.length === 0}
                aria-label={
                  item.layers.some((layer) => layer.visible) ? `Hide ${item.area.name}` : `Show ${item.area.name}`
                }
                title={item.layers.some((layer) => layer.visible) ? 'Hide area layers' : 'Show area layers'}
              >
                {item.layers.some((layer) => layer.visible) ? '◉' : '○'}
              </button>
              {!activeCollapsedAreaIds.has(item.area.id) &&
                item.layers.map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    areas={[]}
                    nested
                    selected={selectedActionLayerIds.includes(layer.id)}
                    dragOver={dragOverId === layer.id}
                    editing={editingId === layer.id}
                    onSelect={handleSelectLayer}
                    onOpenContextMenu={handleOpenLayerContextMenu}
                    onStartEditing={handleStartEditing}
                    onFinishRename={handleFinishRename}
                    onDragStart={handleDragStart}
                    onDragOverLayer={handleDragOverLayer}
                    onDropLayer={handleDrop}
                    onDragEnd={handleCancelDrag}
                    onToggleVisible={onToggleVisible}
                    onDuplicateLayer={onDuplicateLayer}
                    onRemoveLayer={onRemoveLayer}
                  />
                ))}
              {!activeCollapsedAreaIds.has(item.area.id) &&
                item.graphHelpers.map((helper) => (
                  <GraphHelperRow
                    key={helper.id}
                    helper={helper}
                    areaId={item.area.id}
                    onRemoveFromArea={onRemoveNodesFromArea}
                  />
                ))}
            </div>
          ) : (
            <LayerRow
              key={item.layer.id}
              layer={item.layer}
              areas={item.areas}
              selected={selectedActionLayerIds.includes(item.layer.id)}
              dragOver={dragOverId === item.layer.id}
              editing={editingId === item.layer.id}
              onSelect={handleSelectLayer}
              onOpenContextMenu={handleOpenLayerContextMenu}
              onStartEditing={handleStartEditing}
              onFinishRename={handleFinishRename}
              onDragStart={handleDragStart}
              onDragOverLayer={handleDragOverLayer}
              onDropLayer={handleDrop}
              onDragEnd={handleCancelDrag}
              onToggleVisible={onToggleVisible}
              onDuplicateLayer={onDuplicateLayer}
              onRemoveLayer={onRemoveLayer}
            />
          ),
        )}
      </div>
      {contextMenu && (
        <div
          className="layer-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => handleCreateAreaFromSelection(contextMenu.ids)}>
            Create area
          </button>
          {graphAreas.map((area) => (
            <button key={area.id} type="button" onClick={() => handleAddSelectionToArea(area.id, contextMenu.ids)}>
              <span className="layer-area-dot" style={{ background: area.color }} aria-hidden="true" />
              Add to {area.name}
            </button>
          ))}
          {contextMenu.ids.some((id) => areasByLayerId.has(id)) && (
            <button type="button" onClick={() => handleRemoveSelectionFromAreas(contextMenu.ids)}>
              Remove from area
            </button>
          )}
        </div>
      )}
    </div>
  );
}
